#!/usr/bin/env python3
"""
Classifier Service - Scalable semantic classifier generation using Qwen2.5-0.5B.
Can run on CPU or GPU, supports batch processing for maximum throughput.
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch
from contextlib import asynccontextmanager

# Global model variables
classifier_tokenizer = None
classifier_model = None
device = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize model on startup."""
    global classifier_tokenizer, classifier_model, device
    
    # Detect device
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    
    print(f"Loading Qwen2.5-0.5B-Instruct on {device}...")
    
    classifier_tokenizer = AutoTokenizer.from_pretrained('Qwen/Qwen2.5-0.5B-Instruct')
    classifier_model = AutoModelForCausalLM.from_pretrained(
        'Qwen/Qwen2.5-0.5B-Instruct',
        torch_dtype=dtype,
        device_map=device if device == "cuda" else None
    )
    
    if device == "cpu":
        classifier_model.eval()
    
    print(f"✓ Model loaded on {device}")
    
    yield
    
    # Cleanup
    del classifier_model
    del classifier_tokenizer

app = FastAPI(lifespan=lifespan)

class ClassifyRequest(BaseModel):
    text: str

class ClassifyBatchRequest(BaseModel):
    texts: List[str]

def extract_classifiers_single(text: str) -> List[str]:
    """Extract classifiers for a single text."""
    # More constrained prompt to prevent conversational outputs
    prompt = f"""Task: Extract exactly 2 semantic topics from the statement below. Output ONLY the topics, nothing else.

Examples:
Statement: I have a severe peanut allergy
Topics: dietary restriction, health condition

Statement: I love Italian cuisine  
Topics: food preference, cuisine type

Statement: I'm learning to play guitar
Topics: hobby, music

Statement: {text}
Topics:"""
    
    inputs = classifier_tokenizer(prompt, return_tensors="pt")
    
    if device == "cuda":
        inputs = {{k: v.to(device) for k, v in inputs.items()}}
    
    with torch.no_grad():
        outputs = classifier_model.generate(
            **inputs,
            max_new_tokens=20,  # Reduced to prevent rambling
            temperature=0.05,   # Very low for deterministic output
            do_sample=False,    # Greedy decoding
            pad_token_id=classifier_tokenizer.eos_token_id,
            eos_token_id=classifier_tokenizer.eos_token_id,
            repetition_penalty=1.2  # Discourage repetition
        )
    
    response = classifier_tokenizer.decode(outputs[0], skip_special_tokens=True)
    generated = response[len(prompt):].strip()
    
    # More aggressive parsing to extract just the topics
    # Split by common delimiters
    if ',' in generated:
        classifiers = [c.strip() for c in generated.split(',') if c.strip()]
    elif '\n' in generated:
        classifiers = [line.strip() for line in generated.split('\n') if line.strip()]
    else:
        # Single topic or space-separated
        classifiers = [generated.strip()]
    
    # Clean up numbered lists and extra text
    cleaned = []
    for c in classifiers:
        # Remove numbers and dots at start
        c = c.lstrip('0123456789. ')
        # Take only first line if multi-line
        c = c.split('\n')[0].strip()
        # Remove common sentence starters
        for prefix in ['Please', 'I will', 'Let me', 'Here are', 'The topics']:
            if c.startswith(prefix):
                continue
        # Only keep if it looks like a topic (short, no questions)
        if len(c) > 0 and len(c) < 50 and '?' not in c:
            cleaned.append(c)
    
    classifiers = cleaned[:2]  # Take first 2
    
    # Fallback if parsing failed
    if not classifiers:
        if 'food' in text.lower() or 'eat' in text.lower():
            classifiers = ["food preference", "dietary"]
        else:
            classifiers = ["personal preference", "general"]
    
    # Pad to 2
    while len(classifiers) < 2:
        classifiers.append(classifiers[0] if classifiers else "general")
    
    return classifiers[:2]

def extract_classifiers_batch(texts: List[str]) -> List[List[str]]:
    """Extract classifiers for multiple texts (batched for efficiency)."""
    all_classifiers = []
    
    # Process in batches for better GPU utilization
    batch_size = 8 if device == "cuda" else 1
    
    for i in range(0, len(texts), batch_size):
        batch_texts = texts[i:i + batch_size]
        
        for text in batch_texts:
            classifiers = extract_classifiers_single(text)
            all_classifiers.append(classifiers)
    
    return all_classifiers

@app.post("/classify")
async def classify(req: ClassifyRequest):
    """Classify a single text."""
    try:
        classifiers = extract_classifiers_single(req.text)
        return {
            "text": req.text,
            "classifiers": classifiers
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/classify_batch")
async def classify_batch(req: ClassifyBatchRequest):
    """Classify multiple texts in batch (much faster)."""
    try:
        all_classifiers = extract_classifiers_batch(req.texts)
        
        results = []
        for text, classifiers in zip(req.texts, all_classifiers):
            results.append({
                "text": text,
                "classifiers": classifiers
            })
        
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    """Health check."""
    return {
        "status": "ok",
        "model": "Qwen2.5-0.5B-Instruct",
        "device": device,
        "dtype": "float16" if device == "cuda" else "float32"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8766)
