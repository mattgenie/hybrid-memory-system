#!/bin/bash

# Core services
cp src/core/memory/hybrid-memory-service.ts src/
cp src/core/memory/mem0-service.ts src/
cp src/core/memory/qdrant-memory-service.ts src/
cp src/core/memory/qdrant_service.py src/

# Main test files
cp src/test-hybrid-memory.ts tests/
cp src/test-mem0-recall.ts tests/
cp src/test-mem0-performance.ts tests/
cp src/debug-mem0-rerank.ts tests/
cp src/test-qdrant-recall.ts tests/

# Manual tests
cp tests/manual/analyze-mem0-performance.ts tests/
cp tests/manual/test-mem0-api-params.ts tests/
cp tests/manual/test-mem0-parallelism.ts tests/
cp tests/manual/test-optimized-mem0.ts tests/
cp tests/manual/verify-mem0-400ms.ts tests/

# Test results/logs
cp mem0_test_report.json docs/
cp hybrid_test_results.log docs/

echo "Files copied successfully!"
