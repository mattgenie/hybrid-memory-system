# Production Configuration - Hybrid Memory System

**AWS Deployment with Automatic Mem0 Sync**

## Overview

This document describes the production deployment of the Hybrid Memory System on AWS with automatic Mem0 synchronization.

## Architecture

```
┌─────────────────────────────────────────┐
│          Mem0 Cloud API                  │
│     (Source of Truth)                    │
└──────────────┬──────────────────────────┘
               │
               │ Polls every 60s
               ▼
      ┌────────────────────┐
      │  AWS EC2 Instance  │
      │   (t3.medium)      │
      │                    │
      │  ┌──────────────┐  │
      │  │ Mem0 Sync    │  │
      │  │ Daemon       │  │
      │  └──────┬───────┘  │
      │         │          │
      │         ▼          │
      │  ┌──────────────┐  │
      │  │ Qdrant       │  │
      │  │ Service      │  │
      │  │ (Port 8765)  │  │
      │  └──────────────┘  │
      └────────────────────┘
```

## Components

### 1. Mem0 Sync Daemon (`mem0_sync_daemon.py`)

**Purpose**: Automatically polls Mem0 and syncs all users to Qdrant

**Features**:
- Polls Mem0 API every 60 seconds (configurable)
- Discovers all users automatically
- Syncs memories to Qdrant
- Runs continuously as background process

**Configuration**:
```bash
MEM0_API_KEY=m0-xxx...           # Required
QDRANT_URL=http://localhost:8765 # Qdrant service URL
SYNC_INTERVAL_SECONDS=60         # Sync frequency
```

**Process**:
1. Fetches list of users (currently: Matt, Noa, John)
2. For each user, fetches all memories from Mem0
3. Adds each memory to Qdrant with inferred topic
4. Logs sync results
5. Sleeps for SYNC_INTERVAL_SECONDS
6. Repeats

### 2. Qdrant Service (`qdrant_service.py`)

**Purpose**: Fast vector search with local embeddings

**Features**:
- Local sentence-transformers embeddings (all-MiniLM-L6-v2)
- Multi-vector search with heuristic classifiers
- `/list_users` endpoint for user discovery
- `/search` endpoint for memory retrieval
- `/add_memory` endpoint for manual additions

**Endpoints**:
```python
GET  /health        # Health check
GET  /list_users    # List all users with memory counts
POST /search        # Search memories
POST /add_memory    # Add memory (used by sync daemon)
```

## AWS Configuration

### Instance Type

**Recommended**: `t3.medium`
- **vCPUs**: 2
- **RAM**: 4 GB
- **Cost**: ~$0.04/hour (~$1/day)
- **Storage**: 50 GB GP3

**Why t3.medium?**
- Enough RAM for sentence-transformers
- Sufficient CPU for vector search
- Cost-effective for continuous operation

### Security Group

**Ports**:
- 22 (SSH) - For management
- 8765 (Qdrant) - For API access

**Rules**:
```bash
# SSH access
Protocol: TCP, Port: 22, Source: 0.0.0.0/0

# Qdrant API
Protocol: TCP, Port: 8765, Source: 0.0.0.0/0
```

### AMI

**Ubuntu 22.04 LTS** (ami-0e2c8caa4b6378d8c)
- Python 3.10
- System packages pre-installed
- Long-term support

## Deployment

### Automated Deployment

Use the provided deployment script:

```bash
./deploy-hybrid-memory.sh t3.medium
```

The script:
1. Creates AWS instance
2. Installs system packages
3. Creates Python virtual environment
4. Installs dependencies
5. Uploads code
6. Configures environment
7. Starts services

**Time**: ~15 minutes

### Manual Deployment

If you need to deploy manually:

```bash
# 1. Launch instance
AWS_PROFILE=work aws ec2 run-instances \
  --image-id ami-0e2c8caa4b6378d8c \
  --instance-type t3.medium \
  --key-name new-conversation-key \
  --security-group-ids sg-xxx \
  --subnet-id subnet-xxx

# 2. SSH to instance
ssh -i ~/Downloads/new-conversation-key.pem ubuntu@YOUR_IP

# 3. Install dependencies
sudo apt-get update
sudo apt-get install -y python3-pip python3-venv

# 4. Create project directory
mkdir -p ~/hybrid-memory/src
cd ~/hybrid-memory

# 5. Create virtual environment
python3 -m venv venv
source venv/bin/activate

# 6. Install Python packages
pip install python-dotenv qdrant-client sentence-transformers \
            fastapi uvicorn httpx pydantic requests

# 7. Upload code
# (From local machine)
scp -i ~/Downloads/new-conversation-key.pem \
  src/qdrant_service.py \
  src/mem0_sync_daemon.py \
  ubuntu@YOUR_IP:~/hybrid-memory/src/

# 8. Configure environment
cat > .env << EOF
MEM0_API_KEY=m0-YOUR_KEY
QDRANT_URL=http://localhost:8765
SYNC_INTERVAL_SECONDS=60
USE_CLASSIFIER_SERVICE=false
EOF

# 9. Start services
nohup python src/qdrant_service.py > qdrant.log 2>&1 &
nohup python src/mem0_sync_daemon.py > mem0_sync.log 2>&1 &
```

## Environment Variables

### Required

```bash
MEM0_API_KEY=m0-xxx...  # Your Mem0 API key
```

### Optional

```bash
QDRANT_URL=http://localhost:8765  # Qdrant service URL (default: localhost:8765)
SYNC_INTERVAL_SECONDS=60          # Sync frequency in seconds (default: 60)
USE_CLASSIFIER_SERVICE=false      # Classifier service (default: false)
```

## Monitoring

### Service Health

```bash
# Check both services are running
ssh ubuntu@YOUR_IP 'ps aux | grep python'

# Expected output:
# python src/qdrant_service.py
# python src/mem0_sync_daemon.py
```

### Logs

```bash
# Qdrant service logs
ssh ubuntu@YOUR_IP 'tail -f ~/hybrid-memory/qdrant.log'

# Sync daemon logs
ssh ubuntu@YOUR_IP 'tail -f ~/hybrid-memory/mem0_sync.log'
```

### Sync Status

```bash
# Check last sync cycle
ssh ubuntu@YOUR_IP 'tail -20 ~/hybrid-memory/mem0_sync.log'

# Expected output:
# [Sync] ===== Starting sync cycle =====
# [Sync] Matt: 9 synced, 0 errors
# [Sync] Noa: 10 synced, 0 errors
# [Sync] John: 8 synced, 0 errors
# [Sync] ===== Cycle complete: 27 total synced =====
```

### API Health

```bash
# Health check
curl http://YOUR_IP:8765/health

# List users
curl http://YOUR_IP:8765/list_users
```

## Maintenance

### Restart Services

```bash
# Restart Qdrant
ssh ubuntu@YOUR_IP 'pkill -f qdrant_service && cd ~/hybrid-memory && source venv/bin/activate && nohup python src/qdrant_service.py > qdrant.log 2>&1 &'

# Restart sync daemon
ssh ubuntu@YOUR_IP 'pkill -f mem0_sync && cd ~/hybrid-memory && source venv/bin/activate && nohup python src/mem0_sync_daemon.py > mem0_sync.log 2>&1 &'
```

### Update Code

```bash
# From local machine
scp -i ~/Downloads/new-conversation-key.pem \
  src/qdrant_service.py \
  ubuntu@YOUR_IP:~/hybrid-memory/src/

# Restart service
ssh ubuntu@YOUR_IP 'pkill -f qdrant_service && cd ~/hybrid-memory && source venv/bin/activate && nohup python src/qdrant_service.py > qdrant.log 2>&1 &'
```

### Change Sync Frequency

```bash
ssh ubuntu@YOUR_IP

# Edit .env
echo "SYNC_INTERVAL_SECONDS=30" >> ~/hybrid-memory/.env

# Restart daemon
pkill -f mem0_sync
cd ~/hybrid-memory && source venv/bin/activate
nohup python src/mem0_sync_daemon.py > mem0_sync.log 2>&1 &
```

## Cost Analysis

### AWS Costs

| Component | Instance | Cost/hr | Daily | Monthly (24/7) |
|-----------|----------|---------|-------|----------------|
| Qdrant + Sync | t3.medium | $0.04 | $1 | $30 |

### Optimization

**Recommendation**: Terminate instance when not in use

```bash
AWS_PROFILE=work aws ec2 terminate-instances --instance-ids YOUR_INSTANCE_ID
```

**Re-deploy when needed**:
```bash
./deploy-hybrid-memory.sh t3.medium
```

## Performance

### Sync Performance

- **Sync Frequency**: 60 seconds (configurable)
- **Per-User Sync Time**: ~2-3 seconds
- **Total Sync Time** (3 users): ~10 seconds
- **Memory Overhead**: Minimal (< 100MB)

### Search Performance

- **Search Latency**: ~230ms
- **Embedding Generation**: ~50ms
- **Vector Search**: ~150ms
- **Total**: ~230ms (vs 800ms with Mem0 direct)

## Troubleshooting

### Sync Not Working

1. Check daemon is running:
```bash
ssh ubuntu@YOUR_IP 'ps aux | grep mem0_sync'
```

2. Check logs for errors:
```bash
ssh ubuntu@YOUR_IP 'tail -50 ~/hybrid-memory/mem0_sync.log'
```

3. Verify Mem0 API key:
```bash
ssh ubuntu@YOUR_IP 'cat ~/hybrid-memory/.env | grep MEM0'
```

4. Test Mem0 API manually:
```bash
curl -H "Authorization: Token YOUR_KEY" \
  "https://api.mem0.ai/v1/memories/?user_id=Matt"
```

### Qdrant Not Responding

1. Check service is running:
```bash
ssh ubuntu@YOUR_IP 'ps aux | grep qdrant'
```

2. Check logs:
```bash
ssh ubuntu@YOUR_IP 'tail -50 ~/hybrid-memory/qdrant.log'
```

3. Test health endpoint:
```bash
curl http://YOUR_IP:8765/health
```

### High Memory Usage

If the instance runs out of memory:

1. Upgrade to larger instance:
```bash
# Stop instance
AWS_PROFILE=work aws ec2 stop-instances --instance-ids YOUR_INSTANCE_ID

# Change instance type
AWS_PROFILE=work aws ec2 modify-instance-attribute \
  --instance-id YOUR_INSTANCE_ID \
  --instance-type t3.large

# Start instance
AWS_PROFILE=work aws ec2 start-instances --instance-ids YOUR_INSTANCE_ID
```

2. Or reduce sync frequency to lower memory pressure:
```bash
echo "SYNC_INTERVAL_SECONDS=120" >> ~/hybrid-memory/.env
```

## Security

### Best Practices

1. **Restrict Security Group**: Only allow your IP for SSH
2. **Use IAM Roles**: For AWS API access
3. **Rotate API Keys**: Regularly update Mem0 API key
4. **Monitor Logs**: Check for unauthorized access
5. **Enable CloudWatch**: For metrics and alerting

### API Key Security

Never commit API keys to git:

```bash
# .gitignore
.env
*.log
```

Store keys in AWS Secrets Manager for production:

```bash
# Retrieve from Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id mem0-api-key \
  --query SecretString \
  --output text
```

---

**Production-ready deployment for automatic Mem0 → Qdrant sync** 🚀
