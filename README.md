# Hybrid Memory System

A high-performance hybrid memory implementation combining Mem0 (semantic memory) and Qdrant (vector search) for conversational AI applications.

## Overview

This system provides a dual-layer memory architecture:
- **Mem0**: Semantic memory for entity tracking and relationship management
- **Qdrant**: Vector-based episodic memory for conversation recall
- **Hybrid Service**: Intelligent orchestration layer that combines both systems

## Features

- ✅ **Sub-400ms Performance**: Optimized for real-time conversational AI
- ✅ **Parallel Queries**: Concurrent Mem0 and Qdrant searches
- ✅ **Smart Filtering**: Advanced metadata filtering for precise recall
- ✅ **Reranking**: Intelligent result prioritization
- ✅ **TypeScript + Python**: Cross-language support

## Architecture

```
┌─────────────────────────────────────┐
│     Hybrid Memory Service           │
│  (Orchestration & Coordination)     │
└──────────┬──────────────┬───────────┘
           │              │
    ┌──────▼──────┐  ┌───▼──────────┐
    │ Mem0 Service│  │Qdrant Service│
    │  (Semantic) │  │  (Episodic)  │
    └─────────────┘  └──────────────┘
```

## Installation

```bash
npm install
```

### Dependencies
- `mem0ai`: Semantic memory
- `@qdrant/js-client-rest`: Vector search
- `openai`: Embeddings

## Usage

### TypeScript

```typescript
import { HybridMemoryService } from './src/hybrid-memory-service';

const memory = new HybridMemoryService();

// Add memory
await memory.add({
  messages: conversation,
  user_id: "user123"
});

// Search memory
const results = await memory.search({
  query: "What restaurants did we discuss?",
  user_id: "user123",
  limit: 5
});
```

### Python

```python
from qdrant_service import QdrantMemoryService

memory = QdrantMemoryService()

# Add memory
await memory.add_memory(
    user_id="user123",
    messages=conversation
)

# Search memory
results = await memory.search(
    query="What restaurants did we discuss?",
    user_id="user123",
    limit=5
)
```

## Performance

- **Mem0 Search**: ~200-300ms
- **Qdrant Search**: ~50-100ms
- **Hybrid Search**: ~250-400ms (parallel)

See `docs/mem0_test_report.json` for detailed benchmarks.

## Testing

```bash
# Run all tests
npm test

# Run specific tests
npm run test:mem0
npm run test:qdrant
npm run test:hybrid
```

## Files

### Core Services
- `src/hybrid-memory-service.ts` - Main orchestration layer
- `src/mem0-service.ts` - Mem0 semantic memory wrapper
- `src/qdrant-memory-service.ts` - Qdrant vector search wrapper
- `src/qdrant_service.py` - Python Qdrant implementation

### Tests
- `tests/test-hybrid-memory.ts` - Hybrid system tests
- `tests/test-mem0-recall.ts` - Mem0 recall tests
- `tests/test-qdrant-recall.ts` - Qdrant recall tests
- `tests/verify-mem0-400ms.ts` - Performance verification
- `tests/analyze-mem0-performance.ts` - Performance analysis

## Configuration

Environment variables:
```bash
OPENAI_API_KEY=your_key_here
QDRANT_URL=http://localhost:6333
```

## License

MIT

## Contributing

Contributions welcome! Please see CONTRIBUTING.md for guidelines.
