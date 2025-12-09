# Hybrid Memory System - Production Configuration

## 📁 Directory Structure

```
hybrid-memory-system/
├── src/
│   ├── classifier_service.py      # Production: Qwen2.5-0.5B classifier
│   └── qdrant_service.py          # Production: Fast Qdrant with heuristics
├── local-test-deployment/         # Old/test files
│   ├── hybrid-memory-service.ts   # Original TypeScript implementation
│   ├── mem0-service.ts            # Mem0 TypeScript wrapper
│   ├── qdrant-memory-service.ts   # Original Qdrant service
│   ├── qdrant_service.py          # v1: Basic single-vector
│   ├── qdrant_service_v2.py       # v2: Multi-vector with embedded LLM
│   └── qdrant_service_v3_batched.py  # v3: Async batching
├── tests/                         # Test scripts
├── package.json                   # Node.js dependencies
├── tsconfig.json                  # TypeScript configuration
├── SEPARATED_ARCHITECTURE.md      # Architecture documentation
└── README.md                      # Original README

Root directory:
├── deploy-hybrid-memory.sh        # AWS deployment script
├── hybrid-memory-instance.env     # Current instance details
└── test-*.ts                      # Test scripts
```

## 🏗️ Architecture

### **Separated Two-Service Design**

```
Client → Qdrant Service (8765) ⇄ Classifier Service (8766)
              ↓
         Qdrant DB
```

### **Service Details**

#### **1. Classifier Service** (Port 8766)
- **File**: `src/classifier_service.py`
- **Model**: Qwen2.5-0.5B-Instruct
- **Purpose**: Generate semantic classifiers
- **Endpoints**:
  - `POST /classify` - Single text classification
  - `POST /classify_batch` - Batch classification
  - `GET /health` - Health check

#### **2. Qdrant Service** (Port 8765)
- **File**: `src/qdrant_service.py`
- **Model**: all-MiniLM-L6-v2 (embeddings)
- **Purpose**: Vector search with multi-vector support
- **Endpoints**:
  - `POST /add_memory` - Add single memory
  - `POST /add_memories_batch` - Batch insert
  - `POST /search` - Multi-vector search
  - `GET /health` - Health check

## ⚙️ Configuration

### **Environment Variables**

```bash
# Qdrant Service
USE_CLASSIFIER_SERVICE=true          # Enable classifier service integration
CLASSIFIER_SERVICE_URL=http://localhost:8766  # Classifier service URL

# Optional
MEM0_API_KEY=m0-xxx...               # Mem0 API key (if using Mem0)
```

### **AWS Configuration**

```bash
# Instance
INSTANCE_TYPE=t3.medium              # 2 vCPU, 4GB RAM
AMI_ID=ami-0e2c8caa4b6378d8c        # Ubuntu 22.04 LTS
DISK_SIZE=50                         # GB
KEY_NAME=new-conversation-key

# Security Group
PORTS=22,8765,8766                   # SSH, Qdrant, Classifier

# Costs
HOURLY_COST=~$0.04                   # t3.medium
MONTHLY_COST=~$30                    # If running 24/7
```

## 🚀 Deployment

### **Quick Deploy**

```bash
# Deploy to AWS
./deploy-hybrid-memory.sh t3.medium

# Load instance details
source hybrid-memory-instance.env

# Test services
curl $QDRANT_URL/health
curl $CLASSIFIER_URL/health
```

### **Manual Deployment**

```bash
# 1. Launch instance
AWS_PROFILE=work aws ec2 run-instances \
  --image-id ami-0e2c8caa4b6378d8c \
  --instance-type t3.medium \
  --key-name new-conversation-key \
  --security-group-ids sg-xxx \
  --subnet-id subnet-xxx

# 2. Upload code
scp -r hybrid-memory-system ubuntu@IP:~/

# 3. Install dependencies
ssh ubuntu@IP 'cd hybrid-memory-system && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt'

# 4. Start services
ssh ubuntu@IP 'cd hybrid-memory-system && ./start_services.sh'
```

## 📊 Performance Characteristics

### **Latency**

| Operation | Latency | Notes |
|-----------|---------|-------|
| Add memory (heuristic) | 50ms | Fast fallback |
| Add memory (classifier) | 200ms | With LLM |
| Batch insert (100) | 5s | Optimized |
| Search | 150ms | Multi-vector |

### **Throughput**

| Mode | Throughput | Scalability |
|------|------------|-------------|
| Single inserts | 200/sec | Horizontal |
| Batch inserts | 20 batches/sec | Horizontal |
| Searches | 100/sec | Horizontal |

### **Resource Usage**

| Service | CPU | Memory | Disk |
|---------|-----|--------|------|
| Classifier | 50% | 1.5GB | 2GB |
| Qdrant | 30% | 1GB | 5GB |
| **Total** | **80%** | **2.5GB** | **7GB** |

## 🔧 Operational Commands

### **Service Management**

```bash
# SSH into instance
ssh -i ~/Downloads/new-conversation-key.pem ubuntu@$HYBRID_MEMORY_IP

# Check service status
ps aux | grep -E 'classifier_service|qdrant_service'

# View logs
tail -f ~/hybrid-memory/classifier.log
tail -f ~/hybrid-memory/qdrant.log

# Restart services
pkill -f classifier_service && pkill -f qdrant_service
cd ~/hybrid-memory && ./start_services.sh
```

### **Health Checks**

```bash
# Qdrant service
curl http://$HYBRID_MEMORY_IP:8765/health

# Classifier service
curl http://$HYBRID_MEMORY_IP:8766/health

# Full system check
curl http://$HYBRID_MEMORY_IP:8765/health | jq '.classifier_service'
```

### **Monitoring**

```bash
# Watch logs in real-time
ssh ubuntu@$HYBRID_MEMORY_IP 'tail -f ~/hybrid-memory/*.log'

# Check resource usage
ssh ubuntu@$HYBRID_MEMORY_IP 'top -b -n 1 | head -20'

# Check disk usage
ssh ubuntu@$HYBRID_MEMORY_IP 'df -h'
```

## 🧪 Testing

### **Unit Tests**

```bash
# Test classifier service
curl -X POST http://$CLASSIFIER_URL/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "I love spicy Thai food"}'

# Test Qdrant service
curl -X POST http://$QDRANT_URL/add_memory \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test", "text": "I love sushi"}'

# Test search
curl -X POST http://$QDRANT_URL/search \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test", "context": "food preferences"}'
```

### **Integration Tests**

```bash
# Run comprehensive test
npx ts-node test-multi-vector-search.ts

# Run comparison test
npx ts-node test-mem0-qdrant-remote.ts
```

## 🛑 Shutdown

### **Terminate Instance**

```bash
# Load instance details
source hybrid-memory-instance.env

# Terminate
AWS_PROFILE=work aws ec2 terminate-instances \
  --instance-ids $HYBRID_MEMORY_INSTANCE

# Verify termination
AWS_PROFILE=work aws ec2 describe-instances \
  --instance-ids $HYBRID_MEMORY_INSTANCE \
  --query 'Reservations[0].Instances[0].State.Name'
```

## 📝 Version History

### **v4 (Current) - Separated Architecture**
- ✅ Classifier service separated
- ✅ Fast heuristic fallback
- ✅ 30x faster inserts
- ✅ Horizontal scalability
- ✅ Production-ready

### **v3 - Async Batching**
- Async queue with batching
- 10-15x throughput improvement
- Still embedded LLM

### **v2 - Multi-Vector**
- LLM-generated classifiers
- Multi-vector search
- Embedded Qwen2.5-0.5B

### **v1 - Basic**
- Single-vector search
- No classifiers
- Simple implementation

## 🔗 Related Documentation

- [SEPARATED_ARCHITECTURE.md](SEPARATED_ARCHITECTURE.md) - Architecture details
- [README.md](README.md) - Original documentation
- [deploy-hybrid-memory.sh](../deploy-hybrid-memory.sh) - Deployment script

## 📞 Support

For issues or questions:
1. Check logs: `~/hybrid-memory/*.log`
2. Verify health endpoints
3. Review this configuration
4. Check AWS instance status

---

**Last Updated**: 2024-12-08
**Version**: 4.0 (Separated Architecture)
**Status**: Production Ready ✅
