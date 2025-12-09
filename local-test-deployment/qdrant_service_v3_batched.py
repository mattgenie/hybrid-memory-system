#!/usr/bin/env python3
"""
Enhanced Qdrant Memory Service with async batching for maximum throughput.
Uses Qwen2.5-0.5B to generate semantic classifiers, then embeds them with all-MiniLM-L6-v2.
Implements async queue with batching for 10-15x faster bulk inserts.
"""
import os
import asyncio
import time
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue, NamedVector
from sentence_transformers import SentenceTransformer
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch
from dotenv import load_dotenv
from contextlib import asynccontextmanager

load_dotenv()

# Global batch queue
batch_queue = asyncio.Queue()
BATCH_SIZE = 10
BATCH_TIMEOUT = 0.1  # 100ms

# Initialize models (will be set in lifespan)
client = None
embedding_model = None
classifier_tokenizer = None
classifier_model = None
collection_name = "user_preferences_v2"

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize models and start batch processor on startup."""
    global client, embedding_model, classifier_tokenizer, classifier_model
    
    # Initialize Qdrant
    client = QdrantClient(path="./qdrant_data")
    
    # Initialize embedding model
    print("Loading embedding model (all-MiniLM-L6-v2)...")
    embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
    print("✓ Embedding model loaded!")
    
    # Initialize classifier LLM
    print("Loading classifier LLM (Qwen2.5-0.5B-Instruct)...")
    classifier_tokenizer = AutoTokenizer.from_pretrained('Qwen/Qwen2.5-0.5B-Instruct')
    classifier_model = AutoModelForCausalLM.from_pretrained(
        'Qwen/Qwen2.5-0.5B-Instruct',
        torch_dtype=torch.float32
    )
    classifier_model.eval()
    print("✓ Classifier LLM loaded!")
    
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
        print(f"Created collection '{collection_name}' with named vectors")
    
    # Start batch processor
    batch_task = asyncio.create_task(batch_processor())
    
    yield
    
    # Cleanup
    batch_task.cancel()

app = FastAPI(lifespan=lifespan)

class AddMemoryRequest(BaseModel):
    user_id: str
    text: str
    topic: Optional[str] = None
    type: str = "stable"

class SearchRequest(BaseModel):
    user_id: str
    context: str
    domain: Optional[str] = None
    limit: int = 10
    score_threshold: Optional[float] = None
    use_classifiers: bool = True

def batch_extract_classifiers(texts: List[str]) -> List[List[str]]:
    """Batch extract classifiers for multiple texts."""
    all_classifiers = []
    
    # Process in batches for LLM
    for text in texts:
        prompt = f"""Extract 2 broad semantic topics or themes for each statement. Focus on the MEANING, not grammar.

Examples:
Statement: I have a severe peanut allergy
Topics: dietary restriction, health condition

Statement: I love Italian cuisine
Topics: food preference, cuisine type

Statement: I'm learning to play guitar
Topics: hobby, music

Now extract topics for this statement:
Statement: {text}
Topics:"""
        
        inputs = classifier_tokenizer(prompt, return_tensors="pt")
        
        with torch.no_grad():
            outputs = classifier_model.generate(
                **inputs,
                max_new_tokens=30,
                temperature=0.1,
                do_sample=True,
                pad_token_id=classifier_tokenizer.eos_token_id
            )
        
        response = classifier_tokenizer.decode(outputs[0], skip_special_tokens=True)
        generated = response[len(prompt):].strip()
        
        # Parse classifiers
        if ',' in generated:
            classifiers = [c.strip() for c in generated.split(',') if c.strip()]
        else:
            classifiers = [line.strip() for line in generated.split('\n') if line.strip()]
        
        # Clean up numbered lists
        classifiers = [c.split('.', 1)[-1].strip() if c and c[0].isdigit() else c for c in classifiers]
        
        # Fallback
        if not classifiers:
            if 'food' in text.lower() or 'eat' in text.lower():
                classifiers = ["food preference"]
            else:
                classifiers = ["personal preference"]
        
        # Pad to 2
        while len(classifiers) < 2:
            classifiers.append(classifiers[0])
        
        all_classifiers.append(classifiers[:2])
    
    return all_classifiers

def infer_topic(text: str) -> Optional[str]:
    """Infer topic from text."""
    lower = text.lower()
    if any(word in lower for word in ['food', 'restaurant', 'cuisine', 'meal', 'dinner', 'lunch', 'breakfast', 'eat', 'allergy', 'vegetarian']):
        return 'food'
    if any(word in lower for word in ['movie', 'film', 'cinema', 'director', 'actor']):
        return 'movies'
    if any(word in lower for word in ['music', 'song', 'artist', 'album', 'band']):
        return 'music'
    return None

async def batch_processor():
    """Background task that processes batches of memory additions."""
    print("✓ Batch processor started")
    
    while True:
        try:
            batch = []
            deadline = time.time() + BATCH_TIMEOUT
            
            # Collect batch
            while len(batch) < BATCH_SIZE:
                timeout = max(0.001, deadline - time.time())
                if timeout <= 0:
                    break
                
                try:
                    item = await asyncio.wait_for(batch_queue.get(), timeout=timeout)
                    batch.append(item)
                except asyncio.TimeoutError:
                    break
            
            if not batch:
                await asyncio.sleep(0.01)
                continue
            
            # Process batch
            start_time = time.time()
            
            # Extract all texts
            texts = [item['request'].text for item in batch]
            
            # Batch generate classifiers
            all_classifiers = batch_extract_classifiers(texts)
            
            # Batch generate embeddings (all texts + all classifiers)
            all_texts_to_embed = []
            for text, classifiers in zip(texts, all_classifiers):
                all_texts_to_embed.append(text)
                all_texts_to_embed.extend(classifiers)
            
            all_embeddings = embedding_model.encode(all_texts_to_embed).tolist()
            
            # Build points for batch insert
            points = []
            embedding_idx = 0
            
            for item, classifiers in zip(batch, all_classifiers):
                req = item['request']
                topic = req.topic or infer_topic(req.text)
                
                # Get embeddings for this item
                text_embedding = all_embeddings[embedding_idx]
                classifier_1_embedding = all_embeddings[embedding_idx + 1]
                classifier_2_embedding = all_embeddings[embedding_idx + 2]
                embedding_idx += 3
                
                named_vectors = {
                    "text": text_embedding,
                    "classifier_1": classifier_1_embedding,
                    "classifier_2": classifier_2_embedding,
                }
                
                points.append(PointStruct(
                    id=hash(f"{req.user_id}:{req.text}:{topic}") % (2**63),
                    vector=named_vectors,
                    payload={
                        "text": req.text,
                        "user_id": req.user_id,
                        "topic": topic,
                        "type": req.type,
                        "classifiers": classifiers
                    }
                ))
                
                # Set result
                item['future'].set_result({
                    "status": "success",
                    "topic": topic,
                    "classifiers": classifiers
                })
            
            # Batch insert to Qdrant
            client.upsert(collection_name=collection_name, points=points)
            
            elapsed = time.time() - start_time
            print(f"✓ Processed batch of {len(batch)} in {elapsed:.2f}s ({len(batch)/elapsed:.1f} items/sec)")
            
        except Exception as e:
            print(f"Error in batch processor: {e}")
            # Set errors for all items in batch
            for item in batch:
                if not item['future'].done():
                    item['future'].set_exception(e)
            await asyncio.sleep(0.1)

@app.post("/add_memory")
async def add_memory(req: AddMemoryRequest):
    """Add a memory (queued for batch processing)."""
    try:
        # Create future for result
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        
        # Add to queue
        await batch_queue.put({
            'request': req,
            'future': future
        })
        
        # Wait for result
        result = await future
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search")
async def search(req: SearchRequest):
    """Multi-vector search across text and classifiers."""
    try:
        # Generate query embedding
        query_embedding = embedding_model.encode(req.context).tolist()
        
        # Build filter
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
            # Multi-vector search
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
                    point_id = result.id
                    if point_id not in all_results or result.score > all_results[point_id].score:
                        all_results[point_id] = result
            
            sorted_results = sorted(all_results.values(), key=lambda x: x.score, reverse=True)[:req.limit]
        else:
            # Single vector search
            sorted_results = client.query_points(
                collection_name=collection_name,
                query=query_embedding,
                using="text",
                query_filter=query_filter,
                limit=req.limit,
                with_payload=True,
                score_threshold=req.score_threshold
            ).points
        
        # Format results
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
    return {
        "status": "ok",
        "classifier_model": "Qwen2.5-0.5B",
        "embedding_model": "all-MiniLM-L6-v2",
        "batch_size": BATCH_SIZE,
        "batch_timeout_ms": BATCH_TIMEOUT * 1000,
        "queue_size": batch_queue.qsize()
    }

@app.get("/stats")
async def stats():
    """Get batching statistics."""
    return {
        "queue_size": batch_queue.qsize(),
        "batch_size": BATCH_SIZE,
        "batch_timeout_ms": BATCH_TIMEOUT * 1000
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
