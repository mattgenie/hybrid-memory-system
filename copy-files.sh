#!/bin/bash

# Core services
cp ../src/core/memory/hybrid-memory-service.ts src/
cp ../src/core/memory/mem0-service.ts src/
cp ../src/core/memory/qdrant-memory-service.ts src/
cp ../src/core/memory/qdrant_service.py src/

# Main test files
cp ../src/test-hybrid-memory.ts tests/ 2>/dev/null || true
cp ../src/test-hybrid-memory-corrected.ts tests/ 2>/dev/null || true
cp ../src/test-mem0-recall.ts tests/ 2>/dev/null || true
cp ../src/test-mem0-add-response.ts tests/ 2>/dev/null || true
cp ../src/test-mem0-performance.ts tests/ 2>/dev/null || true
cp ../src/debug-mem0-rerank.ts tests/ 2>/dev/null || true
cp ../src/test-qdrant-recall.ts tests/ 2>/dev/null || true

# Manual tests
cp ../tests/manual/analyze-mem0-performance.ts tests/ 2>/dev/null || true
cp ../tests/manual/test-mem0-api-params.ts tests/ 2>/dev/null || true
cp ../tests/manual/test-mem0-parallelism.ts tests/ 2>/dev/null || true
cp ../tests/manual/test-optimized-mem0.ts tests/ 2>/dev/null || true
cp ../tests/manual/verify-mem0-400ms.ts tests/ 2>/dev/null || true

# Test results/logs
cp ../mem0_test_report.json docs/ 2>/dev/null || true
cp ../hybrid_test_results.log docs/ 2>/dev/null || true

echo "Files copied successfully!"
