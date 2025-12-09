#!/usr/bin/env python3
"""
Enhanced Qdrant Memory Service with LLM-generated classifiers.
Uses Qwen2.5-0.5B to generate semantic classifiers, then embeds them with all-MiniLM-L6-v2.
Implements multi-vector search using Qdrant's named vectors for improved recall.
"""
import os
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue, NamedVector
from sentence_transformers import SentenceTransformer
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Initialize Qdrant (persistent local storage)
client = QdrantClient(path="./qdrant_data")
collection_name = "user_preferences_v2"

# Initialize embedding model (all-MiniLM-L6-v2: 22M params, 384 dims)
print("Loading embedding model (all-MiniLM-L6-v2)...")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
print("✓ Embedding model loaded!")

# Initialize classifier LLM (Qwen2.5-0.5B: 500M params)
print("Loading classifier LLM (Qwen2.5-0.5B-Instruct)...")
classifier_tokenizer = AutoTokenizer.from_pretrained('Qwen/Qwen2.5-0.5B-Instruct')
classifier_model = AutoModelForCausalLM.from_pretrained(
    'Qwen/Qwen2.5-0.5B-Instruct',
    torch_dtype=torch.float32  # Use float32 for CPU
)
classifier_model.eval()  # Set to evaluation mode
print("✓ Classifier LLM loaded!")

# Create collection with named vectors
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
    print(f"Created collection '{collection_name}' with named vectors (384 dims each)")

class AddMemoryRequest(BaseModel):
    user_id: str
    text: str
    topic: Optional[str] = None
    type: str = "stable"  # stable or contextual

class SearchRequest(BaseModel):
    user_id: str
    context: str
    domain: Optional[str] = None  # places, movies, music
    limit: int = 10
    score_threshold: Optional[float] = None
    use_classifiers: bool = True  # Enable multi-vector search

def extract_classifiers(text: str) -> List[str]:
    """Use Qwen2.5-0.5B to extract 2-3 semantic classifiers."""
    
    # Few-shot prompt with examples to guide the model
    prompt = f"""Extract 2 broad semantic topics or themes for each statement. Focus on the MEANING, not grammar.

Examples:
Statement: I have a severe peanut allergy
Topics: dietary restriction, health condition, food safety

Statement: I love Italian cuisine
Topics: food preference, cuisine type, taste

Statement: I'm learning to play guitar
Topics: hobby, music, skill development

Now extract topics for this statement:
Statement: {text}
Topics:"""
    
    inputs = classifier_tokenizer(prompt, return_tensors="pt")
    
    with torch.no_grad():
        outputs = classifier_model.generate(
            **inputs,
            max_new_tokens=40,
            temperature=0.1,  # Lower temperature for more focused output
            do_sample=True,
            pad_token_id=classifier_tokenizer.eos_token_id
        )
    
    response = classifier_tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    # Extract the generated part (after the prompt)
    generated = response[len(prompt):].strip()
    
    # Parse classifiers - handle both comma-separated and newline-separated
    if ',' in generated:
        classifiers = [c.strip() for c in generated.split(',') if c.strip()]
    else:
        classifiers = [line.strip() for line in generated.split('\n') if line.strip()]
    
    # Clean up numbered lists (e.g., "1. food" -> "food")
    classifiers = [c.split('.', 1)[-1].strip() if c[0].isdigit() else c for c in classifiers]
    
    # Ensure we have at least 1 classifier
    if not classifiers:
        # Fallback: try to infer from the text
        if 'food' in text.lower() or 'eat' in text.lower():
            classifiers = ["food preference"]
        else:
            classifiers = ["personal preference"]
    
    # Pad to 2 classifiers if needed
    while len(classifiers) < 2:
        classifiers.append(classifiers[0])  # Duplicate first classifier
    
    return classifiers[:2]

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

@app.post("/add_memory")
async def add_memory(req: AddMemoryRequest):
    """Add a memory with LLM-generated classifiers."""
    try:
        # Generate classifiers using Qwen2.5-0.5B
        classifiers = extract_classifiers(req.text)
        
        # Generate embeddings for text and classifiers using all-MiniLM-L6-v2
        text_embedding = embedding_model.encode(req.text).tolist()
        classifier_embeddings = [
            embedding_model.encode(classifier).tolist()
            for classifier in classifiers
        ]
        
        # Infer topic if not provided
        topic = req.topic or infer_topic(req.text)
        
        # Create named vectors
        named_vectors = {
            "text": text_embedding,
            "classifier_1": classifier_embeddings[0],
            "classifier_2": classifier_embeddings[1],
        }
        
        # Add to Qdrant with named vectors
        client.upsert(
            collection_name=collection_name,
            points=[
                PointStruct(
                    id=hash(f"{req.user_id}:{req.text}:{topic}") % (2**63),
                    vector=named_vectors,
                    payload={
                        "text": req.text,
                        "user_id": req.user_id,
                        "topic": topic,
                        "type": req.type,
                        "classifiers": classifiers
                    }
                )
            ]
        )
        
        return {
            "status": "success",
            "topic": topic,
            "classifiers": classifiers
        }
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
            # Multi-vector search: query against all named vectors
            all_results = {}
            
            for vector_name in ["text", "classifier_1", "classifier_2"]:
                results = client.query_points(
                    collection_name=collection_name,
                    query=query_embedding,
                    using=vector_name,  # Specify which named vector to search
                    query_filter=query_filter,
                    limit=req.limit * 2,  # Get more candidates
                    with_payload=True,
                    score_threshold=req.score_threshold
                ).points
                
                # Track best score per point ID
                for result in results:
                    point_id = result.id
                    if point_id not in all_results or result.score > all_results[point_id].score:
                        all_results[point_id] = result
            
            # Sort by best score and limit
            sorted_results = sorted(all_results.values(), key=lambda x: x.score, reverse=True)[:req.limit]
        else:
            # Single vector search (text only)
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
    return {"status": "ok", "classifier_model": "Qwen2.5-0.5B", "embedding_model": "all-MiniLM-L6-v2"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
