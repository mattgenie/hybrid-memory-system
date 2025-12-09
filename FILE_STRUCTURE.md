# 📁 Hybrid Memory System - File Structure

**Clean, production-ready AWS daemon deployment**

## Core Files

### Services (src/)
- ✅ `qdrant_service.py` - Qdrant vector search service
- ✅ `mem0_sync_daemon.py` - Automatic Mem0 → Qdrant sync daemon

### Documentation
- ✅ `README.md` - Overview and quick start
- ✅ `QUICKSTART.md` - Step-by-step deployment guide
- ✅ `PRODUCTION_CONFIG.md` - Production deployment details
- ✅ `CORS_SUPPORT.md` - CORS configuration

### Deployment
- ✅ `deploy-hybrid-memory.sh` - Automated AWS deployment script
- ✅ `requirements.txt` - Python dependencies

### Configuration
- ✅ `.gitignore` - Git ignore rules
- ✅ `package.json` - Project metadata

### Demo
- ✅ `hybrid-memory-demo.html` - Web UI for testing

### API Documentation
- ✅ `openapi.yaml` - OpenAPI specification
- ✅ `postman_collection.json` - Postman collection

## Deleted Files (Obsolete)

The following files have been removed as they referenced deprecated approaches:

- ❌ `SEPARATED_ARCHITECTURE.md` - Old multi-service architecture
- ❌ `TEST_SUITE.md` - Manual testing documentation
- ❌ `deploy-classifier-gpu.sh` - Classifier service deployment
- ❌ `src/classifier_service.py` - Classifier service (not used)
- ❌ `src/qdrant_service_v*.py` - Old versions
- ❌ `test-*.ts` - Manual test scripts
- ❌ `tests/` - Test directory
- ❌ `local-test-deployment/` - Local testing
- ❌ `docs/` - Old documentation

## What Remains

**Only files relevant to AWS daemon deployment:**

```
hybrid-memory-system/
├── src/
│   ├── qdrant_service.py          # Qdrant API service
│   └── mem0_sync_daemon.py        # Automatic sync daemon
├── README.md                       # Main documentation
├── QUICKSTART.md                   # Quick start guide
├── PRODUCTION_CONFIG.md            # Production setup
├── CORS_SUPPORT.md                 # CORS configuration
├── deploy-hybrid-memory.sh         # AWS deployment script
├── requirements.txt                # Python dependencies
├── hybrid-memory-demo.html         # Web UI demo
├── openapi.yaml                    # API specification
├── postman_collection.json         # API testing
├── package.json                    # Project metadata
└── .gitignore                      # Git ignore

Total: 12 files (clean and focused)
```

## Usage

### Deploy to AWS
```bash
./deploy-hybrid-memory.sh t3.medium
```

### Test Locally
```bash
# Start Qdrant service
python src/qdrant_service.py

# In another terminal, start sync daemon
python src/mem0_sync_daemon.py
```

### View Demo
Open `hybrid-memory-demo.html` in browser and point to your AWS instance.

---

**Clean, focused, production-ready** ✨
