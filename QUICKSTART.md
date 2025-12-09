# ⚡ Quickstart Guide

Get the Hybrid Memory System running in 5 minutes!

## 🎯 Goal

By the end of this guide, you'll have:
- ✅ Qdrant service running locally
- ✅ Classifier service running (CPU or GPU)
- ✅ Successfully added and searched memories
- ✅ Run the test suite

## 📋 Prerequisites

```bash
# Check Python version (3.8+ required)
python3 --version

# Check Node.js version (16+ required, for tests)
node --version

# Check if you have git
git --version
```

## 🚀 5-Minute Setup

### Step 1: Clone and Install (2 minutes)

```bash
# Clone the repository
git clone <repo-url>
cd hybrid-memory-system

# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install python-dotenv qdrant-client sentence-transformers \
            fastapi uvicorn transformers torch httpx

# Install Node dependencies (for tests)
npm install
```

### Step 2: Start Services (2 minutes)

**Terminal 1 - Qdrant Service:**
```bash
cd hybrid-memory-system
source venv/bin/activate
python src/qdrant_service.py
```

Wait for: `✓ Embedding model loaded!`

**Terminal 2 - Classifier Service (Optional):**
```bash
cd hybrid-memory-system
source venv/bin/activate
python src/classifier_service.py
```

Wait for: `✓ Model loaded on cpu`

> **Note**: Classifier service is optional. Qdrant will use fast heuristics if it's not available.

### Step 3: Test It! (1 minute)

**Terminal 3 - Quick Test:**
```bash
# Add a memory
curl -X POST http://localhost:8765/add_memory \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "quickstart-user",
    "text": "I love spicy Thai food",
    "topic": "food",
    "type": "stable"
  }'

# Search for it
curl -X POST http://localhost:8765/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "quickstart-user",
    "context": "food preferences",
    "limit": 5,
    "use_classifiers": true
  }'
```

**Expected Response:**
```json
{
  "memories": [
    {
      "text": "I love spicy Thai food",
      "score": 0.85,
      "classifiers": ["food preference", "cuisine type"],
      "topic": "food"
    }
  ]
}
```

## 🎉 Success!

If you see the memory returned, you're all set! 

## 🧪 Run the Test Suite

```bash
# Comprehensive comparison test (Mem0 vs Qdrant)
npx ts-node test-final-comparison.ts

# Classifier quality test
npx ts-node test-classifier-quality.ts

# Batch performance test
npx ts-node test-batch-fix.ts
```

## 🌐 Try the Web UI

Open `hybrid-memory-demo.html` in your browser for a visual interface!

## 📊 What's Happening?

### When you add a memory:

1. **Instant Response** (~50-200ms)
   - Heuristic classifiers generated
   - Text embedded with all-MiniLM-L6-v2
   - Stored in Qdrant

2. **Background (Async)**
   - LLM generates better classifiers
   - Re-embeds with improved classifiers
   - Updates Qdrant entry

### When you search:

1. **Multi-Vector Search**
   - Query embedded
   - Searches across: text + classifier_1 + classifier_2
   - Returns best matches from all vectors

2. **Score Filtering**
   - Applies threshold (default: 0.27)
   - Returns only high-quality matches

## 🚀 Next Steps

### Deploy to AWS

```bash
# Deploy Qdrant (t3.medium)
./deploy-hybrid-memory.sh t3.medium

# Deploy GPU Classifier (g4dn.xlarge) - Optional but recommended
./deploy-classifier-gpu.sh
```

### Customize

```python
# src/qdrant_service.py

# Adjust score threshold
score_threshold = 0.27  # Higher = more precision, lower = more recall

# Change embedding model
embedding_model = SentenceTransformer('your-model-here')
```

### Monitor Performance

```bash
# Check service health
curl http://localhost:8765/health

# View logs
tail -f qdrant.log
tail -f classifier.log
```

## 🐛 Troubleshooting

### Service won't start

```bash
# Check if port is already in use
lsof -i :8765  # Qdrant
lsof -i :8766  # Classifier

# Kill existing process
pkill -f qdrant_service
pkill -f classifier_service
```

### Slow performance

```bash
# Check if classifier service is running
curl http://localhost:8766/health

# If not, Qdrant falls back to heuristics (still fast!)
```

### Import errors

```bash
# Reinstall dependencies
pip install --upgrade -r requirements.txt
```

## 💡 Tips

1. **Start with heuristics only** - Fast and good enough for most use cases
2. **Add GPU classifier later** - When you need the extra quality
3. **Use batch endpoints** - For bulk operations (10-15x faster)
4. **Tune score threshold** - Based on your precision/recall needs

## 📚 Learn More

- [Architecture Details](SEPARATED_ARCHITECTURE.md)
- [Production Deployment](PRODUCTION_CONFIG.md)
- [Test Suite Documentation](TEST_SUITE.md)
- [API Reference](README.md#api-usage)

## ✅ Checklist

- [ ] Services running locally
- [ ] Successfully added a memory
- [ ] Successfully searched memories
- [ ] Ran at least one test
- [ ] Explored the web UI
- [ ] Read the architecture docs

**Congratulations! You're ready to build with the Hybrid Memory System! 🎉**
