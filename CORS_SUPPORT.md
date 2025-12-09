# CORS Support - Hybrid Memory System

The Qdrant service includes CORS support for web applications.

## Configuration

CORS is enabled by default in `qdrant_service.py`:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)
```

## Production Configuration

For production, restrict origins to your application domain:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://yourdomain.com",
        "https://app.yourdomain.com"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)
```

## Testing CORS

```bash
# Test from browser console
fetch('http://YOUR_IP:8765/health')
  .then(r => r.json())
  .then(console.log)

# Test with curl
curl -H "Origin: https://yourdomain.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -X OPTIONS \
  http://YOUR_IP:8765/search
```

## Update CORS Settings

1. SSH to instance:
```bash
ssh -i ~/Downloads/new-conversation-key.pem ubuntu@YOUR_IP
```

2. Edit `src/qdrant_service.py` to update CORS settings

3. Restart service:
```bash
pkill -f qdrant_service
cd ~/hybrid-memory && source venv/bin/activate
nohup python src/qdrant_service.py > qdrant.log 2>&1 &
```

## Common Issues

### CORS Error in Browser

If you see: `Access to fetch at 'http://...' from origin '...' has been blocked by CORS policy`

**Solution**: Add your origin to `allow_origins` list

### Credentials Not Allowed

If using cookies/auth, ensure:
```python
allow_credentials=True
allow_origins=["https://specific-domain.com"]  # Cannot use "*" with credentials
```

---

**CORS is enabled by default for easy development** 🌐
