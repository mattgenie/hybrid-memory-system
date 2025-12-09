# 🚀 Hybrid Memory System

> GPU-accelerated vector search with multi-vector classification for intelligent memory retrieval

[![Performance](https://img.shields.io/badge/Insert-169ms-green)](https://github.com)
[![Search](https://img.shields.io/badge/Search-287ms-green)](https://github.com)
[![Recall](https://img.shields.io/badge/Recall-100%25-brightgreen)](https://github.com)
[![Cost](https://img.shields.io/badge/API_Cost-FREE-blue)](https://github.com)

## 📋 Overview

A production-ready memory system that combines:
- **Qdrant** for fast vector search
- **GPU-accelerated classification** using Qwen2.5-0.5B
- **Multi-vector search** for superior recall
- **Async architecture** for instant responses
- **Zero API costs** with local embeddings

### Performance vs Mem0

| Metric | Mem0 | Hybrid System | Improvement |
|--------|------|---------------|-------------|
| **Insert Latency** | 682ms | **169ms** | **4x faster** |
| **Search Latency** | 1145ms | **287ms** | **4x faster** |
| **Precision** | 100% | **100%** | Same |
| **Recall** | 80% | **100%** | **+25%** |
| **API Cost** | $$$ | **FREE** | **100% savings** |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT APPLICATION                       │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
        ┌────────────────┐
        │  Qdrant Service│  (Port 8765)
        │   (t3.medium)  │
        │                │
        │  - Fast Insert │  ← Heuristics (50ms)
        │  - Embeddings  │  ← all-MiniLM-L6-v2
        │  - Search      │  ← Multi-vector ANN
        └────────┬───────┘
                 │ (async background)
                 ▼
        ┌────────────────┐
        │  Classifier    │  (Port 8766)
        │  (g4dn.xlarge) │
        │                │
        │  - Qwen2.5-0.5B│  ← GPU inference
        │  - NVIDIA T4   │  ← 15-20x faster
        │  - Batch API   │  ← Efficient
        └────────────────┘
```

## ✨ Features

- ✅ **Instant Inserts** - Returns in ~169ms with heuristic classifiers
- ✅ **Async GPU Improvement** - Background LLM classification
- ✅ **Multi-Vector Search** - Search across text + semantic classifiers
- ✅ **100% Recall** - Find all relevant memories
- ✅ **Local Embeddings** - No API costs (all-MiniLM-L6-v2)
- ✅ **GPU Acceleration** - 15-20x faster classification
- ✅ **Batch Processing** - Efficient bulk operations
- ✅ **Score Thresholding** - Filter low-quality results

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- Node.js 16+ (for tests)
- AWS CLI configured (for deployment)
- SSH key pair for AWS

### 1. Local Development

```bash
# Clone the repository
git clone <repo-url>
cd hybrid-memory-system

# Install Python dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Install Node dependencies (for tests)
npm install

# Start Qdrant service (CPU mode)
python src/qdrant_service.py

# In another terminal, start classifier service
python src/classifier_service.py
```

### 2. AWS Deployment

```bash
# Deploy Qdrant service (t3.medium)
./deploy-hybrid-memory.sh t3.medium

# Deploy GPU classifier (g4dn.xlarge)
./deploy-classifier-gpu.sh

# Connect services (update Qdrant with classifier URL)
source classifier-gpu-instance.env
ssh -i ~/Downloads/new-conversation-key.pem ubuntu@<QDRANT_IP> \
  "echo 'CLASSIFIER_SERVICE_URL=http://$CLASSIFIER_IP:8766' >> ~/hybrid-memory/.env"
```

### 3. Test the System

```bash
# Run comprehensive comparison test
npx ts-node test-final-comparison.ts

# Test classifier quality
npx ts-node test-classifier-quality.ts

# Test batch performance
npx ts-node test-batch-fix.ts
```

## 📚 Documentation

- [**Quickstart Guide**](QUICKSTART.md) - Get started in 5 minutes
- [**Architecture**](SEPARATED_ARCHITECTURE.md) - System design details
- [**Production Config**](PRODUCTION_CONFIG.md) - Deployment guide
- [**Test Suite**](TEST_SUITE.md) - How to run tests

## 🧪 API Usage

### Add Memory

```typescript
const response = await axios.post('http://localhost:8765/add_memory', {
  user_id: 'user123',
  text: 'I have a severe peanut allergy',
  topic: 'food',
  type: 'stable'
});

// Response: { status: 'success', classifiers: [...], async_improvement: true }
```

### Search Memories

```typescript
const response = await axios.post('http://localhost:8765/search', {
  user_id: 'user123',
  context: 'dietary restrictions',
  domain: 'places',
  limit: 10,
  use_classifiers: true,
  score_threshold: 0.27
});

// Response: { memories: [...] }
```

### Health Check

```bash
curl http://localhost:8765/health
# { "status": "ok", "classifier_service": "connected", ... }
```

## 📊 Test Results

### Comprehensive Comparison (Mem0 vs Hybrid)

```
┌─────────────────────┬──────────────┬──────────────┬──────────────┐
│ Metric              │ Mem0         │ Qdrant (GPU) │ Winner       │
├─────────────────────┼──────────────┼──────────────┼──────────────┤
│ Insert Latency      │ 682ms        │ 169ms        │ Qdrant ✓     │
│ Search Latency      │ 1145ms       │ 287ms        │ Qdrant ✓     │
│ Precision           │ 100.0%       │ 100.0%       │ Tie          │
│ Recall              │ 80.0%        │ 100.0%       │ Qdrant ✓     │
│ API Cost            │ $$$          │ FREE         │ Qdrant ✓     │
└─────────────────────┴──────────────┴──────────────┴──────────────┘
```

## 💰 Cost Analysis

### AWS Costs

| Component | Instance | Cost/hr | Monthly (24/7) |
|-----------|----------|---------|----------------|
| Qdrant Service | t3.medium | $0.04 | $30 |
| Classifier (on-demand) | g4dn.xlarge | $0.53 | $380 |
| **Total (always-on)** | | **$0.57** | **$410** |
| **Total (smart usage)** | | **$0.04-0.10** | **$30-70** |

**Optimization**: Run classifier only when needed, use heuristics for real-time inserts.

### vs Mem0 Costs

- **Mem0**: API calls for every search + embedding + storage
- **Hybrid**: Zero API costs (local embeddings + GPU)
- **Savings**: 100% on API costs

## 🔧 Configuration

### Environment Variables

```bash
# Qdrant Service
USE_CLASSIFIER_SERVICE=true
CLASSIFIER_SERVICE_URL=http://localhost:8766

# Optional
MEM0_API_KEY=m0-xxx...  # For comparison tests
```

### Performance Tuning

```python
# qdrant_service.py
score_threshold = 0.27  # Adjust for precision/recall tradeoff

# classifier_service.py
max_new_tokens = 20     # Reduce for faster inference
temperature = 0.05      # Lower for more deterministic output
```

## 🎯 Use Cases

- **Conversational AI** - Remember user preferences across sessions
- **Recommendation Systems** - Personalized suggestions based on history
- **Customer Support** - Recall past interactions and preferences
- **Personal Assistants** - Context-aware responses
- **RAG Applications** - Enhanced retrieval with semantic understanding

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines first.

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- **Qdrant** - Vector database
- **Sentence Transformers** - Embedding models
- **Qwen** - Classification LLM
- **Mem0** - Inspiration and comparison baseline

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)
- **Email**: support@example.com

---

**Built with ❤️ for production-ready AI memory systems**
