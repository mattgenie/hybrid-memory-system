#!/usr/bin/env python3
"""
Qdrant Service - Fast vector search with optional classifier service integration.
Uses simple heuristics for instant inserts, can call classifier service for better quality.
"""
import os
import asyncio
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from sentence_transformers import SentenceTransformer
from contextlib import asynccontextmanager
import httpx
from dotenv import load_dotenv

load_dotenv()

# Configuration
CLASSIFIER_SERVICE_URL = os.getenv("CLASSIFIER_SERVICE_URL", "http://localhost:8766")
USE_CLASSIFIER_SERVICE = os.getenv("USE_CLASSIFIER_SERVICE", "true").lower() == "true"

# Global variables
client = None
embedding_model = None
collection_name = "user_preferences_v4"
http_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize on startup."""
    global client, embedding_model, http_client
    
    # Initialize Qdrant
    client = QdrantClient(path="./qdrant_data")
    
    # Initialize embedding model
    print("Loading embedding model (all-MiniLM-L6-v2)...")
    embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
    print("✓ Embedding model loaded!")
    
    # HTTP client for classifier service
    http_client = httpx.AsyncClient(timeout=30.0)
    
    # Create collection
    try:
        client.get_collection(collection_name)
        print(f"Collection '{collection_name}' already exists")
    except:
        client.create_collection(
            collection_name=collection_name,
            vectors_config={
                "text": VectorParams(size=384, distance=Distance.COSINE),
                "classifier_1": VectorParams(size=384, distance=Distance.COSINE),
                "classifier_2": VectorParams(size=384, distance=Distance.COSINE),
            }
        )
        print(f"Created collection '{collection_name}'")
    
    # Test classifier service
    if USE_CLASSIFIER_SERVICE:
        try:
            response = await http_client.get(f"{CLASSIFIER_SERVICE_URL}/health")
            print(f"✓ Classifier service connected: {response.json()}")
        except:
            print(f"⚠️  Classifier service not available, using heuristics")
    
    yield
    
    # Cleanup
    await http_client.aclose()

app = FastAPI(lifespan=lifespan)

# Add CORS middleware to allow browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

class AddMemoryRequest(BaseModel):
    user_id: str
    text: str
    topic: Optional[str] = None
    type: str = "stable"
    classifiers: Optional[List[str]] = None  # Pre-computed classifiers

class AddMemoriesBatchRequest(BaseModel):
    memories: List[AddMemoryRequest]

class SearchRequest(BaseModel):
    user_id: str
    context: str
    domain: Optional[str] = None
    limit: int = 10
    score_threshold: Optional[float] = None
    use_classifiers: bool = True

def simple_heuristic_classifiers(text: str) -> List[str]:
    """Fast heuristic-based classifier (no LLM needed)."""
    lower = text.lower()
    
    # Food-related
    if any(word in lower for word in ['food', 'eat', 'meal', 'dinner', 'lunch', 'breakfast', 'restaurant', 'cuisine']):
        if any(word in lower for word in ['allergy', 'allergic']):
            return ["dietary restriction", "health condition"]
        if any(word in lower for word in ['vegetarian', 'vegan']):
            return ["dietary preference", "lifestyle"]
        if any(word in lower for word in ['love', 'like', 'enjoy', 'favorite']):
            return ["food preference", "taste"]
        if any(word in lower for word in ['hate', 'dislike', 'avoid']):
            return ["food aversion", "taste"]
        return ["food preference", "dietary"]
    
    # Movies
    if any(word in lower for word in ['movie', 'film', 'cinema', 'director', 'actor']):
        return ["entertainment preference", "media"]
    
    # Music
    if any(word in lower for word in ['music', 'song', 'artist', 'album', 'band']):
        return ["music preference", "entertainment"]
    
    # Default
    return ["personal preference", "general"]

async def get_classifiers(text: str, provided_classifiers: Optional[List[str]] = None) -> List[str]:
    """Get classifiers: use provided, call service, or use heuristic."""
    
    # Option 1: Use provided classifiers (pre-computed)
    if provided_classifiers and len(provided_classifiers) >= 2:
        return provided_classifiers[:2]
    
    # Option 2: Call classifier service
    if USE_CLASSIFIER_SERVICE:
        try:
            response = await http_client.post(
                f"{CLASSIFIER_SERVICE_URL}/classify",
                json={"text": text},
                timeout=2.0  # Fast timeout
            )
            if response.status_code == 200:
                return response.json()["classifiers"]
        except:
            pass  # Fall through to heuristic
    
    # Option 3: Use fast heuristic
    return simple_heuristic_classifiers(text)

def infer_topic(text: str) -> Optional[str]:
    """Infer topic from text."""
    lower = text.lower()
    if any(word in lower for word in ['food', 'restaurant', 'cuisine', 'meal', 'eat', 'allergy', 'vegetarian']):
        return 'food'
    if any(word in lower for word in ['movie', 'film', 'cinema']):
        return 'movies'
    if any(word in lower for word in ['music', 'song', 'artist']):
        return 'music'
    return None

@app.post("/add_memory")
async def add_memory(req: AddMemoryRequest):
    """Add a single memory (instant with heuristics, async LLM improvement)."""
    try:
        # Use heuristics for instant insert
        classifiers = req.classifiers[:2] if req.classifiers and len(req.classifiers) >= 2 else simple_heuristic_classifiers(req.text)
        
        # Generate embeddings
        texts_to_embed = [req.text] + classifiers
        embeddings = embedding_model.encode(texts_to_embed).tolist()
        
        # Infer topic
        topic = req.topic or infer_topic(req.text)
        
        # Create named vectors
        named_vectors = {
            "text": embeddings[0],
            "classifier_1": embeddings[1],
            "classifier_2": embeddings[2],
        }
        
        point_id = hash(f"{req.user_id}:{req.text}:{topic}") % (2**63)
        
        # Insert to Qdrant immediately
        client.upsert(
            collection_name=collection_name,
            points=[PointStruct(
                id=point_id,
                vector=named_vectors,
                payload={
                    "text": req.text,
                    "user_id": req.user_id,
                    "topic": topic,
                    "type": req.type,
                    "classifiers": classifiers,
                    "classifier_source": "provided" if req.classifiers else "heuristic"
                }
            )]
        )
        
        # Async: Improve classifiers with LLM in background (fire and forget)
        if not req.classifiers and USE_CLASSIFIER_SERVICE:
            asyncio.create_task(improve_classifiers_async(req.user_id, req.text, topic, point_id))
        
        return {
            "status": "success",
            "topic": topic,
            "classifiers": classifiers,
            "classifier_source": "provided" if req.classifiers else "heuristic",
            "async_improvement": not req.classifiers and USE_CLASSIFIER_SERVICE
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def improve_classifiers_async(user_id: str, text: str, topic: str, point_id: int):
    """Background task to improve classifiers with LLM."""
    try:
        # Call classifier service
        response = await http_client.post(
            f"{CLASSIFIER_SERVICE_URL}/classify",
            json={"text": text},
            timeout=10.0
        )
        
        if response.status_code == 200:
            llm_classifiers = response.json()["classifiers"]
            
            # Re-embed with better classifiers
            texts_to_embed = [text] + llm_classifiers
            embeddings = embedding_model.encode(texts_to_embed).tolist()
            
            # Update the point with better classifiers
            named_vectors = {
                "text": embeddings[0],
                "classifier_1": embeddings[1],
                "classifier_2": embeddings[2],
            }
            
            client.upsert(
                collection_name=collection_name,
                points=[PointStruct(
                    id=point_id,
                    vector=named_vectors,
                    payload={
                        "text": text,
                        "user_id": user_id,
                        "topic": topic,
                        "type": "stable",
                        "classifiers": llm_classifiers,
                        "classifier_source": "llm_async"
                    }
                )]
            )
    except Exception as e:
        # Silent failure - heuristic classifiers are already in place
        pass

@app.post("/add_memories_batch")
async def add_memories_batch(req: AddMemoriesBatchRequest):
    """Add multiple memories in batch (optimized)."""
    try:
        # Collect all texts
        texts = [m.text for m in req.memories]
        
        # Get classifiers for all (batch call to classifier service)
        all_classifiers = []
        
        # Separate memories with/without provided classifiers
        needs_classification = []
        needs_classification_indices = []
        
        for i, memory in enumerate(req.memories):
            if memory.classifiers and len(memory.classifiers) >= 2:
                all_classifiers.append(memory.classifiers[:2])
            else:
                all_classifiers.append(None)  # Placeholder
                needs_classification.append(memory.text)
                needs_classification_indices.append(i)
        
        # Batch classify if needed
        if needs_classification and USE_CLASSIFIER_SERVICE:
            try:
                response = await http_client.post(
                    f"{CLASSIFIER_SERVICE_URL}/classify_batch",
                    json={"texts": needs_classification},
                    timeout=30.0
                )
                if response.status_code == 200:
                    batch_results = response.json()["results"]
                    for idx, result in zip(needs_classification_indices, batch_results):
                        all_classifiers[idx] = result["classifiers"]
            except:
                pass  # Fall through to heuristics
        
        # Fill in any remaining with heuristics
        for i, classifiers in enumerate(all_classifiers):
            if classifiers is None:
                all_classifiers[i] = simple_heuristic_classifiers(req.memories[i].text)
        
        # Batch embed everything
        all_texts_to_embed = []
        for text, classifiers in zip(texts, all_classifiers):
            all_texts_to_embed.extend([text] + classifiers)
        
        all_embeddings = embedding_model.encode(all_texts_to_embed).tolist()
        
        # Build points
        points = []
        embedding_idx = 0
        
        for memory, classifiers in zip(req.memories, all_classifiers):
            topic = memory.topic or infer_topic(memory.text)
            
            named_vectors = {
                "text": all_embeddings[embedding_idx],
                "classifier_1": all_embeddings[embedding_idx + 1],
                "classifier_2": all_embeddings[embedding_idx + 2],
            }
            embedding_idx += 3
            
            points.append(PointStruct(
                id=hash(f"{memory.user_id}:{memory.text}:{topic}") % (2**63),
                vector=named_vectors,
                payload={
                    "text": memory.text,
                    "user_id": memory.user_id,
                    "topic": topic,
                    "type": memory.type,
                    "classifiers": classifiers
                }
            ))
        
        # Batch insert
        client.upsert(collection_name=collection_name, points=points)
        
        return {
            "status": "success",
            "inserted": len(points)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search")
async def search(req: SearchRequest):
    """Multi-vector search."""
    try:
        query_embedding = embedding_model.encode(req.context).tolist()
        
        must_conditions = [
            FieldCondition(key="user_id", match=MatchValue(value=req.user_id))
        ]
        
        if req.domain:
            topic_map = {"places": "food", "movies": "movies", "music": "music"}
            if req.domain in topic_map:
                must_conditions.append(
                    FieldCondition(key="topic", match=MatchValue(value=topic_map[req.domain]))
                )
        
        query_filter = Filter(must=must_conditions) if must_conditions else None
        
        if req.use_classifiers:
            all_results = {}
            
            for vector_name in ["text", "classifier_1", "classifier_2"]:
                results = client.query_points(
                    collection_name=collection_name,
                    query=query_embedding,
                    using=vector_name,
                    query_filter=query_filter,
                    limit=req.limit * 2,
                    with_payload=True,
                    score_threshold=req.score_threshold
                ).points
                
                for result in results:
                    if result.id not in all_results or result.score > all_results[result.id].score:
                        all_results[result.id] = result
            
            sorted_results = sorted(all_results.values(), key=lambda x: x.score, reverse=True)[:req.limit]
        else:
            sorted_results = client.query_points(
                collection_name=collection_name,
                query=query_embedding,
                using="text",
                query_filter=query_filter,
                limit=req.limit,
                with_payload=True,
                score_threshold=req.score_threshold
            ).points
        
        memories = []
        for result in sorted_results:
            memories.append({
                "text": result.payload.get("text"),
                "topic": result.payload.get("topic"),
                "type": result.payload.get("type"),
                "classifiers": result.payload.get("classifiers", []),
                "score": result.score
            })
        
        return {"memories": memories}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    """Health check."""
    classifier_status = "disabled"
    if USE_CLASSIFIER_SERVICE:
        try:
            response = await http_client.get(f"{CLASSIFIER_SERVICE_URL}/health", timeout=1.0)
            classifier_status = "connected" if response.status_code == 200 else "error"
        except:
            classifier_status = "unavailable"
    
    return {
        "status": "ok",
        "embedding_model": "all-MiniLM-L6-v2",
        "classifier_service": classifier_status,
        "classifier_url": CLASSIFIER_SERVICE_URL if USE_CLASSIFIER_SERVICE else None
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
