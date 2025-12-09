# 🚀 Hybrid Memory System - Quick Start

Get your automatic Mem0 → Qdrant sync running on AWS in 15 minutes.

## Prerequisites

1. **AWS CLI** with SSO configured
2. **SSH Key** at `~/Downloads/new-conversation-key.pem`
3. **Mem0 API Key** from [mem0.ai](https://mem0.ai)

## Step 1: Configure Mem0 API Key

Edit `deploy-hybrid-memory.sh` and add your Mem0 API key:

```bash
# Line 209 in deploy-hybrid-memory.sh
MEM0_API_KEY=m0-YOUR_KEY_HERE
```

## Step 2: Deploy to AWS

```bash
cd hybrid-memory-system
./deploy-hybrid-memory.sh t3.medium
```

The script will:
- ✅ Create AWS t3.medium instance
- ✅ Install Python dependencies
- ✅ Upload code
- ✅ Start Qdrant service (port 8765)
- ✅ Start Mem0 sync daemon
- ✅ Begin automatic syncing every 60 seconds

**Time**: ~15 minutes

## Step 3: Verify Deployment

The script outputs your instance IP. Use it to verify:

```bash
# Replace YOUR_IP with the IP from deployment output

# 1. Check health
curl http://YOUR_IP:8765/health

# Expected: {"status": "ok", "embedding_model": "all-MiniLM-L6-v2"}

# 2. List users (wait 60s for first sync)
curl http://YOUR_IP:8765/list_users

# Expected: {"users": [...], "total_users": N, "total_memories": N}

# 3. Search memories
curl -X POST http://YOUR_IP:8765/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_ID",
    "context": "food",
    "limit": 5
  }'
```

## Step 4: Monitor Sync Daemon

```bash
# SSH to instance
ssh -i ~/Downloads/new-conversation-key.pem ubuntu@YOUR_IP

# Watch sync logs
tail -f ~/hybrid-memory/mem0_sync.log
```

Expected output every 60 seconds:
```
[Sync] ===== Starting sync cycle at 2024-12-09 16:00:00 =====
[Sync] Found 3 users to sync
[Sync] Syncing Matt...
[Sync] Matt: 9 synced, 0 errors
[Sync] Syncing Noa...
[Sync] Noa: 10 synced, 0 errors
[Sync] Syncing John...
[Sync] John: 8 synced, 0 errors
[Sync] ===== Cycle complete: 27 total synced, 0 total errors =====
[Sync] Sleeping for 60 seconds...
```

## Step 5: Use in Your Application

Update your application's `.env` file:

```bash
QDRANT_URL=http://YOUR_IP:8765
```

Then use the Qdrant API:

```typescript
import axios from 'axios';

const QDRANT_URL = process.env.QDRANT_URL;

// List all users
const users = await axios.get(`${QDRANT_URL}/list_users`);
console.log(users.data);

// Search memories
const memories = await axios.post(`${QDRANT_URL}/search`, {
  user_id: 'Matt',
  context: 'food preferences',
  limit: 10
});
console.log(memories.data.memories);
```

## Configuration

### Change Sync Frequency

Default is 60 seconds. To change:

```bash
ssh -i ~/Downloads/new-conversation-key.pem ubuntu@YOUR_IP

# Edit .env
echo "SYNC_INTERVAL_SECONDS=30" >> ~/hybrid-memory/.env

# Restart daemon
pkill -f mem0_sync_daemon
cd ~/hybrid-memory && source venv/bin/activate
nohup python src/mem0_sync_daemon.py > mem0_sync.log 2>&1 &
```

### Add New Users

Just add memories to Mem0 - they'll automatically sync!

```bash
curl -X POST https://api.mem0.ai/v1/memories/ \
  -H "Authorization: Token YOUR_MEM0_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "I love pizza"}],
    "user_id": "Alice"
  }'

# Wait 60 seconds, then check Qdrant
curl http://YOUR_IP:8765/list_users
# Alice will appear!
```

## Monitoring Commands

```bash
# Check both services are running
ssh ubuntu@YOUR_IP 'ps aux | grep python'

# Qdrant logs
ssh ubuntu@YOUR_IP 'tail -f ~/hybrid-memory/qdrant.log'

# Sync daemon logs
ssh ubuntu@YOUR_IP 'tail -f ~/hybrid-memory/mem0_sync.log'

# Restart Qdrant
ssh ubuntu@YOUR_IP 'pkill -f qdrant_service && cd ~/hybrid-memory && source venv/bin/activate && nohup python src/qdrant_service.py > qdrant.log 2>&1 &'

# Restart sync daemon
ssh ubuntu@YOUR_IP 'pkill -f mem0_sync && cd ~/hybrid-memory && source venv/bin/activate && nohup python src/mem0_sync_daemon.py > mem0_sync.log 2>&1 &'
```

## Terminate Instance

When done testing:

```bash
AWS_PROFILE=work aws ec2 terminate-instances --instance-ids YOUR_INSTANCE_ID
```

**Cost**: ~$0.04/hour (~$1/day if left running)

## Troubleshooting

### No users appearing?

1. Check Mem0 has memories:
```bash
curl -H "Authorization: Token YOUR_MEM0_KEY" \
  "https://api.mem0.ai/v1/memories/?user_id=YOUR_USER"
```

2. Check sync daemon is running:
```bash
ssh ubuntu@YOUR_IP 'ps aux | grep mem0_sync'
```

3. Check sync logs for errors:
```bash
ssh ubuntu@YOUR_IP 'tail -50 ~/hybrid-memory/mem0_sync.log'
```

### Qdrant not responding?

1. Check service is running:
```bash
ssh ubuntu@YOUR_IP 'ps aux | grep qdrant'
```

2. Check logs:
```bash
ssh ubuntu@YOUR_IP 'tail -50 ~/hybrid-memory/qdrant.log'
```

3. Restart if needed (see Monitoring Commands above)

## Next Steps

- See [README.md](README.md) for architecture details
- See [PRODUCTION_CONFIG.md](PRODUCTION_CONFIG.md) for production setup
- Check `deploy-hybrid-memory.sh` for deployment customization

---

**You're done!** Your Mem0 memories are now automatically syncing to Qdrant every 60 seconds. 🎉
