#!/usr/bin/env python3
"""
Qdrant Memory Service with FastAPI wrapper.
Provides HTTP API for TypeScript to use Qdrant without npm dependency conflicts.
Uses local sentence-transformers for embeddings (no API costs).
"""
import os
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Initialize Qdrant (persistent local storage)
client = QdrantClient(path="./qdrant_data")
collection_name = "user_preferences"

# Initialize local embedding model (all-MiniLM-L6-v2: 22M params, 384 dims)
print("Loading embedding model...")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
print("Embedding model loaded!")

# Create collection if not exists
try:
    client.get_collection(collection_name)
    print(f"Collection '{collection_name}' already exists")
except:
    client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(size=384, distance=Distance.COSINE)  # MiniLM-L6-v2 dimension
    )
    print(f"Created collection '{collection_name}' with 384 dimensions")

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

def infer_topic(text: str) -> Optional[str]:
    """Infer topic from text."""
    lower = text.lower()
    if any(word in lower for word in ['food', 'restaurant', 'cuisine', 'meal', 'dinner', 'lunch', 'breakfast', 'eat']):
        return 'food'
    if any(word in lower for word in ['movie', 'film', 'cinema', 'director', 'actor']):
        return 'movies'
    if any(word in lower for word in ['music', 'song', 'artist', 'album', 'band']):
        return 'music'
    return None

@app.post("/add_memory")
async def add_memory(req: AddMemoryRequest):
    """Add a memory to Qdrant."""
    try:
        # Generate embedding using local model
        embedding = embedding_model.encode(req.text).tolist()
        
        # Infer topic if not provided
        topic = req.topic or infer_topic(req.text)
        
        # Add to Qdrant
        client.upsert(
            collection_name=collection_name,
            points=[
                PointStruct(
                    id=hash(f"{req.user_id}:{req.text}:{topic}") % (2**63),  # Unique ID
                    vector=embedding,
                    payload={
                        "text": req.text,
                        "user_id": req.user_id,
                        "topic": topic,
                        "type": req.type
                    }
                )
            ]
        )
        
        return {"status": "success", "topic": topic}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search")
async def search(req: SearchRequest):
    """Search for memories."""
    try:
        # Generate query embedding using local model
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
        
        # Search using Qdrant's query_points API
        results = client.query_points(
            collection_name=collection_name,
            query=query_embedding,
            query_filter=Filter(must=must_conditions) if must_conditions else None,
            limit=req.limit,
            with_payload=True
        ).points
        
        # Format results
        memories = []
        for result in results:
            memories.append({
                "text": result.payload.get("text"),
                "topic": result.payload.get("topic"),
                "type": result.payload.get("type"),
                "score": result.score
            })
        
        return {"memories": memories}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
