#!/bin/bash
#
# Hybrid Memory System - AWS Deployment Script
# Deploys separated architecture with Classifier + Qdrant services
#

set -e

# Configuration
INSTANCE_TYPE="${1:-t3.medium}"
AMI_ID="ami-0e2c8caa4b6378d8c"  # Ubuntu 22.04 LTS
KEY_NAME="new-conversation-key"
KEY_PATH="$HOME/Downloads/${KEY_NAME}.pem"
SECURITY_GROUP_NAME="hybrid-memory-sg"
DISK_SIZE=50  # GB

echo "========================================================================"
echo "HYBRID MEMORY SYSTEM - SEPARATED ARCHITECTURE DEPLOYMENT"
echo "========================================================================"
echo ""
echo "Instance Type: $INSTANCE_TYPE"
echo "AMI: Ubuntu 22.04 LTS"
echo "Disk: ${DISK_SIZE}GB"
echo "Services: Classifier (8766) + Qdrant (8765)"
echo ""

# Verify prerequisites
echo "Verifying prerequisites..."
if [ ! -f "$KEY_PATH" ]; then
    echo "Error: SSH key not found at $KEY_PATH"
    exit 1
fi

if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI not installed"
    exit 1
fi

if [ ! -d "hybrid-memory-system/src" ]; then
    echo "Error: hybrid-memory-system/src directory not found"
    exit 1
fi

echo "✅ Prerequisites verified"
echo ""

# Get network configuration
echo "Getting network configuration..."
SUBNET=$(AWS_PROFILE=work aws ec2 describe-subnets \
  --filters "Name=default-for-az,Values=true" \
  --query 'Subnets[0].SubnetId' \
  --output text)

VPC=$(AWS_PROFILE=work aws ec2 describe-subnets \
  --subnet-ids $SUBNET \
  --query 'Subnets[0].VpcId' \
  --output text)

echo "  Subnet: $SUBNET"
echo "  VPC: $VPC"

# Create/update security group
echo "Configuring security group..."
SG_ID=$(AWS_PROFILE=work aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$SECURITY_GROUP_NAME" "Name=vpc-id,Values=$VPC" \
  --query 'SecurityGroups[0].GroupId' \
  --output text 2>/dev/null || echo "None")

if [ "$SG_ID" = "None" ]; then
    SG_ID=$(AWS_PROFILE=work aws ec2 create-security-group \
      --group-name $SECURITY_GROUP_NAME \
      --description "Hybrid Memory System - Classifier + Qdrant" \
      --vpc-id $VPC \
      --query 'GroupId' \
      --output text)
    echo "  Created security group: $SG_ID"
else
    echo "  Using existing security group: $SG_ID"
fi

# Configure security group rules
AWS_PROFILE=work aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 22 --cidr 0.0.0.0/0 2>/dev/null || true

AWS_PROFILE=work aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 8765 --cidr 0.0.0.0/0 2>/dev/null || true

AWS_PROFILE=work aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 8766 --cidr 0.0.0.0/0 2>/dev/null || true

echo "✅ Network configured"
echo ""

# Launch instance
echo "========================================================================"
echo "Launching Instance"
echo "========================================================================"
echo ""

INSTANCE_ID=$(AWS_PROFILE=work aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type $INSTANCE_TYPE \
  --key-name $KEY_NAME \
  --security-group-ids $SG_ID \
  --subnet-id $SUBNET \
  --associate-public-ip-address \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=hybrid-memory-separated}]' \
  --block-device-mappings "[{\"DeviceName\":\"/dev/sda1\",\"Ebs\":{\"VolumeSize\":${DISK_SIZE},\"VolumeType\":\"gp3\"}}]" \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Instance ID: $INSTANCE_ID"
echo "Waiting for instance to start..."

AWS_PROFILE=work aws ec2 wait instance-running --instance-ids $INSTANCE_ID

IP=$(AWS_PROFILE=work aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo "✅ Instance running at $IP"
echo ""

# Wait for SSH
echo "Waiting for SSH to be available..."
for i in {1..30}; do
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY_PATH" ubuntu@$IP "echo SSH ready" 2>/dev/null; then
        break
    fi
    echo "  Attempt $i/30..."
    sleep 10
done

echo "✅ SSH available"
echo ""

# System setup
echo "========================================================================"
echo "System Setup"
echo "========================================================================"
echo ""

ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" ubuntu@$IP <<'SETUP'
# Update system
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

# Install dependencies
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    python3-pip \
    python3-venv \
    curl

echo "✅ System packages installed"
SETUP

echo "✅ System configured"
echo ""

# Upload code
echo "Uploading hybrid-memory-system..."
cd hybrid-memory-system
tar czf ../hybrid-memory-system.tar.gz src/ package.json tsconfig.json 2>/dev/null || true
cd ..

scp -o StrictHostKeyChecking=no -i "$KEY_PATH" hybrid-memory-system.tar.gz ubuntu@$IP:~/
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" ubuntu@$IP "mkdir -p hybrid-memory && cd hybrid-memory && tar xzf ../hybrid-memory-system.tar.gz"

echo "✅ Code uploaded"
echo ""

# Install dependencies
echo "Installing dependencies..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" ubuntu@$IP <<'DEPS'
cd ~/hybrid-memory

# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python packages
echo "Installing Python packages..."
pip install --quiet --upgrade pip
pip install --quiet python-dotenv
pip install --quiet qdrant-client
pip install --quiet sentence-transformers
pip install --quiet fastapi
pip install --quiet uvicorn
pip install --quiet transformers
pip install --quiet torch
pip install --quiet accelerate
pip install --quiet httpx

echo "✅ Python dependencies installed"
DEPS

echo "✅ Dependencies installed"
echo ""

# Configure environment
echo "Configuring environment..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" ubuntu@$IP "echo 'USE_CLASSIFIER_SERVICE=true' > ~/hybrid-memory/.env && echo 'CLASSIFIER_SERVICE_URL=http://localhost:8766' >> ~/hybrid-memory/.env"

echo "✅ Environment configured"
echo ""

# Start services
echo "========================================================================"
echo "Starting Services"
echo "========================================================================"
echo ""

ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" ubuntu@$IP <<'START'
cd ~/hybrid-memory
source venv/bin/activate

# Start classifier service
echo "Starting classifier service (port 8766)..."
nohup python src/classifier_service.py > classifier.log 2>&1 &
sleep 30

# Start Qdrant service
echo "Starting Qdrant service (port 8765)..."
export USE_CLASSIFIER_SERVICE=true
export CLASSIFIER_SERVICE_URL=http://localhost:8766
nohup python src/qdrant_service.py > qdrant.log 2>&1 &
sleep 10

echo "✅ Services started"
START

echo "Waiting for services to initialize..."
sleep 10

# Health check
echo "Checking service health..."
QDRANT_HEALTH=$(curl -s http://$IP:8765/health 2>/dev/null || echo "not ready")
if [[ "$QDRANT_HEALTH" == *"ok"* ]]; then
    echo "✅ Qdrant service: OK"
else
    echo "⚠️  Qdrant service may still be starting"
fi

echo ""
echo "========================================================================"
echo "DEPLOYMENT COMPLETE"
echo "========================================================================"
echo ""
echo "✅ Hybrid Memory System deployed successfully!"
echo ""
echo "Instance Details:"
echo "  ID: $INSTANCE_ID"
echo "  IP: $IP"
echo "  Type: $INSTANCE_TYPE"
echo "  Cost: ~\$0.04/hour (t3.medium)"
echo ""
echo "Services:"
echo "  Qdrant API: http://$IP:8765"
echo "  Classifier API: http://$IP:8766"
echo "  Health Check: http://$IP:8765/health"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 MONITORING COMMANDS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "SSH into instance:"
echo "  ssh -i $KEY_PATH ubuntu@$IP"
echo ""
echo "Check Qdrant logs:"
echo "  ssh -i $KEY_PATH ubuntu@$IP 'tail -f ~/hybrid-memory/qdrant.log'"
echo ""
echo "Check Classifier logs:"
echo "  ssh -i $KEY_PATH ubuntu@$IP 'tail -f ~/hybrid-memory/classifier.log'"
echo ""
echo "Test Qdrant health:"
echo "  curl http://$IP:8765/health"
echo ""
echo "Test Classifier health:"
echo "  curl http://$IP:8766/health"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🛑 TERMINATE INSTANCE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  AWS_PROFILE=work aws ec2 terminate-instances --instance-ids $INSTANCE_ID"
echo ""

# Save instance details
cat > hybrid-memory-instance.env <<EOF
export HYBRID_MEMORY_INSTANCE=$INSTANCE_ID
export HYBRID_MEMORY_IP=$IP
export HYBRID_MEMORY_TYPE=$INSTANCE_TYPE
export QDRANT_URL=http://$IP:8765
export CLASSIFIER_URL=http://$IP:8766
EOF

echo "Instance details saved to: hybrid-memory-instance.env"
echo ""
echo "⚠️  Remember to terminate the instance when done!"
