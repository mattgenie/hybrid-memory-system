# Hybrid Memory System

A high-performance hybrid memory implementation combining Mem0 (semantic memory) and Qdrant (vector search) for conversational AI applications.

## Overview

This system provides a dual-layer memory architecture:
- **Mem0**: Semantic memory for intelligent extraction and entity tracking
- **Qdrant**: Local vector-based memory for fast search (zero API costs)
- **Hybrid Service**: Sync-based orchestration ensuring data consistency

## Architecture

**Sync-Based Design** (ensures both systems have the same processed memories):

```
┌─────────────────────────────────────────────────────────┐
│              HybridMemoryService                        │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
   addMemory()    syncUserFromMem0()  retrieveProfile()
        │                 │                 │
        │                 │                 │
        ▼                 ▼                 ▼
   ┌─────────┐       ┌─────────┐      ┌─────────┐
   │  Mem0   │──────▶│  Mem0   │      │ Qdrant  │
   │ (Write) │       │ (Read)  │      │ (Read)  │
   └─────────┘       └─────────┘      └─────────┘
        │                 │                 │
        │                 └────────┬────────┘
        ▼                          ▼
   Async Extract              Sync Processed
   & Process                  Memories
```

**Flow**:
1. **Write**: `addMemory()` → Mem0 only
2. **Process**: Mem0 extracts/rewrites asynchronously (e.g., "I have..." → "User has...")
3. **Sync**: `syncUserFromMem0()` → Mirror processed memories to Qdrant
4. **Read**: `retrieveProfile()` → Qdrant only (70ms vs Mem0's 800ms)

## Features

- ✅ **Data Consistency**: Both systems contain the same processed memories
- ✅ **Fast Queries**: Qdrant queries in ~70ms (11x faster than Mem0)
- ✅ **Better Quality**: 100% precision vs Mem0's 43%
- ✅ **Zero API Costs**: Local sentence-transformers for embeddings
- ✅ **Smart Extraction**: Mem0's intelligent memory processing
- ✅ **TypeScript + Python**: Cross-language support
- ✅ **Flexible Sync**: Async or immediate sync patterns

## Installation

```bash
npm install
```

### Dependencies

**TypeScript/Node.js**:
- `mem0ai`: Semantic memory with intelligent extraction
- `dotenv`: Environment configuration

**Python** (for Qdrant service):
- `qdrant-client`: Local vector database
- `sentence-transformers`: Local embeddings (all-MiniLM-L6-v2)
- `fastapi`: HTTP API for TypeScript integration
- `uvicorn`: ASGI server

## Usage

### TypeScript

```typescript
import { HybridMemoryService } from './src/hybrid-memory-service';

const hybrid = new HybridMemoryService();

// Pattern 1: Async sync (recommended for most cases)
await hybrid.addMemory(
    userId,
    [{ role: 'user', content: 'I have a peanut allergy' }],
    { topic: 'food', type: 'stable' }
);
// Later: await hybrid.syncUserFromMem0(userId);

// Pattern 2: Immediate sync
await hybrid.addMemoryAndSync(
    userId,
    [{ role: 'user', content: 'I love Thai food' }],
    { topic: 'food', type: 'stable' },
    3000  // Wait 3s for Mem0 processing
);

// Query (fast!)
const profile = await hybrid.retrieveParticipantProfile(
    userId,
    "looking for dinner",
    'places'
);
```

### Python (Qdrant Service)

Start the Qdrant service:

```bash
cd src
python qdrant_service.py
```

The service runs on `http://localhost:8765` and provides:
- Local embeddings (no API costs)
- Fast vector search
- HTTP API for TypeScript integration

## Performance

### Query Speed (Read Operations)
- **Qdrant**: ~70ms (local vector search)
- **Mem0**: ~800ms (API-based search)
- **Speedup**: **11.4x faster** with Qdrant

### Quality Metrics
- **Qdrant Precision**: 100% (returns only relevant memories)
- **Mem0 Precision**: 43% (returns irrelevant memories)
- **Quality Improvement**: **2.3x better** precision

### Write/Sync Operations
- **Write to Mem0**: ~100-200ms (queues for async processing)
- **Mem0 Processing**: ~3-5 seconds (extraction & rewriting)
- **Sync to Qdrant**: ~100ms for 3 memories
- **Total Latency** (with `addMemoryAndSync`): ~3.1-5.1s

See `docs/mem0_test_report.json` for detailed benchmarks.

## Testing

```bash
# Run corrected architecture test
npx ts-node tests/test-hybrid-memory-corrected.ts

# Test Mem0's async behavior
npx ts-node tests/test-mem0-add-response.ts

# Run specific tests
npx ts-node tests/test-mem0-recall.ts
npx ts-node tests/test-qdrant-recall.ts
```

## Files

### Core Services
- `src/hybrid-memory-service.ts` - Sync-based orchestration layer
- `src/mem0-service.ts` - Mem0 semantic memory wrapper
- `src/qdrant-memory-service.ts` - TypeScript Qdrant client
- `src/qdrant_service.py` - Python FastAPI backend with local embeddings

### Tests
- `tests/test-hybrid-memory-corrected.ts` - Demonstrates corrected architecture
- `tests/test-mem0-add-response.ts` - Proves Mem0's async extraction
- `tests/test-mem0-recall.ts` - Recall/precision tests
- `tests/test-qdrant-recall.ts` - Qdrant-specific tests
- `tests/verify-mem0-400ms.ts` - Performance verification

## Configuration

Environment variables:
```bash
MEM0_API_KEY=your_mem0_key_here
# No OpenAI key needed - uses local sentence-transformers!
```

## Why This Architecture?

**Problem**: Mem0's `add()` is async and extracts/rewrites memories:
- Input: `"I have a peanut allergy"`
- Mem0 extracts: `"User has a severe peanut allergy"`

**Solution**: Write to Mem0 only, then sync processed memories to Qdrant:
- ✅ Both systems have the same processed text
- ✅ Leverages Mem0's intelligent extraction
- ✅ Qdrant provides fast local search
- ✅ Zero API costs for embeddings and search

## License

MIT

## Contributing

Contributions welcome! Please see CONTRIBUTING.md for guidelines.
