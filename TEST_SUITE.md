# 🧪 Test Suite Documentation

Complete guide to running and understanding the test suite.

## 📋 Overview

The test suite validates:
- ✅ Insert performance
- ✅ Search latency
- ✅ Precision and recall
- ✅ Classifier quality
- ✅ Batch processing
- ✅ Comparison with Mem0

## 🚀 Running Tests

### Prerequisites

```bash
# Install Node dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env and add your MEM0_API_KEY (for comparison tests)
```

### Quick Test

```bash
# Run all tests
npm test

# Or run individual tests
npx ts-node test-final-comparison.ts
npx ts-node test-classifier-quality.ts
npx ts-node test-batch-fix.ts
```

## 📝 Test Files

### 1. `test-final-comparison.ts`

**Purpose**: Comprehensive comparison between Mem0 and Qdrant

**What it tests**:
- Insert performance (latency, throughput)
- Search performance (latency, quality)
- Precision and recall metrics
- Cost comparison

**Expected output**:
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

**Run time**: ~30-40 seconds

**Requirements**:
- Qdrant service running
- MEM0_API_KEY in .env

### 2. `test-classifier-quality.ts`

**Purpose**: Validate classifier output quality

**What it tests**:
- Classifier generates clean topics
- No conversational text in output
- Appropriate semantic categories
- Consistent formatting

**Expected output**:
```
Text: "I have a severe peanut allergy"
  → dietary restriction, health condition
  ✅ Clean

Text: "I love spicy Thai food"
  → food preference, cuisine type
  ✅ Clean
```

**Run time**: ~10-15 seconds

**Requirements**:
- Classifier service running

### 3. `test-batch-fix.ts`

**Purpose**: Verify batch processing performance

**What it tests**:
- Batch insert throughput
- Speedup vs single inserts
- Classifier batching working correctly

**Expected output**:
```
✅ Batch inserted 10 memories
   Total time: 8200ms
   Average per item: 820ms
   Throughput: 1.2 inserts/sec
   Speedup vs single: 2.8x
```

**Run time**: ~15-20 seconds

**Requirements**:
- Qdrant service running
- Classifier service running

### 4. `test-multi-vector-search.ts`

**Purpose**: Test multi-vector search capabilities

**What it tests**:
- Multi-vector vs single-vector search
- Recall improvement with classifiers
- Score distribution

**Expected output**:
```
Query: "dietary restrictions"
  
Results (Multi-Vector):
  1. I have a severe peanut allergy (score: 0.797)
     Classifiers: dietary restriction, health condition
  2. I am vegetarian (score: 0.379)
     Classifiers: dietary preference, lifestyle
```

**Run time**: ~10 seconds

**Requirements**:
- Qdrant service running

## 📊 Understanding Test Results

### Insert Performance

**Good**: < 200ms average
**Acceptable**: 200-500ms
**Needs improvement**: > 500ms

**Factors**:
- Classifier service availability (async = faster)
- Network latency
- GPU vs CPU classification

### Search Performance

**Good**: < 300ms
**Acceptable**: 300-500ms
**Needs improvement**: > 500ms

**Factors**:
- Number of vectors searched
- Score threshold (lower = more candidates)
- Database size

### Precision

**Formula**: (Relevant results found) / (Total results returned)

**Target**: > 90%

**Tuning**:
- Increase `score_threshold` for higher precision
- Adjust domain filters

### Recall

**Formula**: (Relevant results found) / (Total relevant items)

**Target**: > 90%

**Tuning**:
- Decrease `score_threshold` for higher recall
- Enable multi-vector search
- Improve classifier quality

## 🔧 Test Configuration

### Adjusting Test Parameters

```typescript
// test-final-comparison.ts

// Change test dataset size
const foodMemories = [
  // Add more test cases here
];

// Adjust score threshold
score_threshold: 0.27  // Lower = more recall, higher = more precision

// Change search limit
limit: 10  // Number of results to return
```

### Environment Variables

```bash
# .env file

# Required for Mem0 comparison
MEM0_API_KEY=m0-xxx...

# Optional: Override service URLs
QDRANT_URL=http://localhost:8765
CLASSIFIER_URL=http://localhost:8766
```

## 🐛 Troubleshooting

### Test fails with "Connection refused"

```bash
# Check if services are running
curl http://localhost:8765/health
curl http://localhost:8766/health

# Start services if needed
python src/qdrant_service.py
python src/classifier_service.py
```

### Mem0 comparison fails

```bash
# Check API key
echo $MEM0_API_KEY

# Verify it's in .env
cat .env | grep MEM0_API_KEY

# Test Mem0 connection
curl -H "Authorization: Token $MEM0_API_KEY" \
  https://api.mem0.ai/v1/memories/
```

### Tests are slow

```bash
# Check if classifier service is running on GPU
curl http://localhost:8766/health
# Should show: "device": "cuda"

# If on CPU, performance will be slower
# Deploy GPU version for faster tests
```

### Inconsistent results

```bash
# Clear Qdrant database
rm -rf qdrant_data/

# Restart services
pkill -f qdrant_service
python src/qdrant_service.py
```

## 📈 Benchmarking

### Custom Benchmark

```typescript
// custom-benchmark.ts
import axios from 'axios';

const ITERATIONS = 100;
const QDRANT_URL = 'http://localhost:8765';

async function benchmark() {
    const times = [];
    
    for (let i = 0; i < ITERATIONS; i++) {
        const start = Date.now();
        
        await axios.post(`${QDRANT_URL}/add_memory`, {
            user_id: 'bench',
            text: `Test memory ${i}`,
            topic: 'test'
        });
        
        times.push(Date.now() - start);
    }
    
    const avg = times.reduce((a, b) => a + b) / times.length;
    const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
    
    console.log(`Average: ${avg.toFixed(0)}ms`);
    console.log(`P95: ${p95}ms`);
}

benchmark();
```

### Load Testing

```bash
# Install artillery
npm install -g artillery

# Run load test
artillery quick --count 10 --num 100 \
  http://localhost:8765/health
```

## ✅ Test Checklist

Before deploying to production:

- [ ] All tests pass locally
- [ ] Insert latency < 200ms
- [ ] Search latency < 300ms
- [ ] Precision > 90%
- [ ] Recall > 90%
- [ ] Classifier quality validated
- [ ] Batch processing working
- [ ] Mem0 comparison favorable
- [ ] Load test passed
- [ ] GPU acceleration verified (if using)

## 📚 Additional Resources

- [Architecture Documentation](SEPARATED_ARCHITECTURE.md)
- [Production Configuration](PRODUCTION_CONFIG.md)
- [Quickstart Guide](QUICKSTART.md)
- [Main README](README.md)

## 🤝 Contributing Tests

To add a new test:

1. Create `test-your-feature.ts`
2. Follow the existing test structure
3. Add documentation here
4. Update the test checklist
5. Submit a PR

---

**Happy Testing! 🧪**
