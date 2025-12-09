#!/bin/bash
#
# Deploy Classifier Service on GPU Instance (g4dn.xlarge)
#

set -e

INSTANCE_TYPE="g4dn.xlarge"
AMI_ID="ami-0e2c8caa4b6378d8c"  # Ubuntu 22.04 LTS
KEY_NAME="new-conversation-key"
KEY_PATH="$HOME/Downloads/${KEY_NAME}.pem"
SECURITY_GROUP_NAME="classifier-gpu-sg"
DISK_SIZE=50

echo "========================================================================"
echo "CLASSIFIER SERVICE - GPU DEPLOYMENT (g4dn.xlarge)"
echo "========================================================================"
echo ""
echo "Instance: $INSTANCE_TYPE (NVIDIA T4 GPU)"
echo "Cost: ~\$0.526/hour"
echo "Performance: 15-20x faster than CPU"
echo ""

# Verify prerequisites
if [ ! -f "$KEY_PATH" ]; then
    echo "Error: SSH key not found"
    exit 1
fi

if [ ! -f "hybrid-memory-system/src/classifier_service.py" ]; then
    echo "Error: classifier_service.py not found"
    exit 1
fi

echo "Getting network configuration..."
SUBNET=$(AWS_PROFILE=work aws ec2 describe-subnets \
  --filters "Name=default-for-az,Values=true" \
  --query 'Subnets[0].SubnetId' \
  --output text)

VPC=$(AWS_PROFILE=work aws ec2 describe-subnets \
  --subnet-ids $SUBNET \
  --query 'Subnets[0].VpcId' \
  --output text)

# Create security group
echo "Configuring security group..."
SG_ID=$(AWS_PROFILE=work aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$SECURITY_GROUP_NAME" "Name=vpc-id,Values=$VPC" \
  --query 'SecurityGroups[0].GroupId' \
  --output text 2>/dev/null || echo "None")

if [ "$SG_ID" = "None" ]; then
    SG_ID=$(AWS_PROFILE=work aws ec2 create-security-group \
      --group-name $SECURITY_GROUP_NAME \
      --description "Classifier Service GPU" \
      --vpc-id $VPC \
      --query 'GroupId' \
      --output text)
fi

AWS_PROFILE=work aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 22 --cidr 0.0.0.0/0 2>/dev/null || true

AWS_PROFILE=work aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp --port 8766 --cidr 0.0.0.0/0 2>/dev/null || true

echo "✅ Network configured"
echo ""

# Launch instance
echo "Launching g4dn.xlarge instance..."
INSTANCE_ID=$(AWS_PROFILE=work aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type $INSTANCE_TYPE \
  --key-name $KEY_NAME \
  --security-group-ids $SG_ID \
  --subnet-id $SUBNET \
  --associate-public-ip-address \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=classifier-gpu}]' \
  --block-device-mappings "[{\"DeviceName\":\"/dev/sda1\",\"Ebs\":{\"VolumeSize\":${DISK_SIZE},\"VolumeType\":\"gp3\"}}]" \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Instance ID: $INSTANCE_ID"
echo "Waiting for instance..."

AWS_PROFILE=work aws ec2 wait instance-running --instance-ids $INSTANCE_ID

IP=$(AWS_PROFILE=work aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo "✅ Instance running at $IP"
echo ""

# Wait for SSH
echo "Waiting for SSH..."
for i in {1..30}; do
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY_PATH" ubuntu@$IP "echo ready" 2>/dev/null; then
        break
    fi
    sleep 10
done

echo "✅ SSH available"
echo ""

# Install NVIDIA drivers and CUDA
echo "Installing NVIDIA drivers and CUDA..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" ubuntu@$IP <<'SETUP'
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    python3-pip \
    python3-venv \
    curl

# Install NVIDIA drivers
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    nvidia-driver-535 \
    nvidia-cuda-toolkit

echo "✅ NVIDIA drivers installed"
SETUP

echo "✅ System configured"
echo ""

# Upload code
echo "Uploading classifier service..."
scp -o StrictHostKeyChecking=no -i "$KEY_PATH" \
    hybrid-memory-system/src/classifier_service.py \
    ubuntu@$IP:~/

echo "✅ Code uploaded"
echo ""

# Install Python dependencies
echo "Installing Python dependencies..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" ubuntu@$IP <<'DEPS'
python3 -m venv venv
source venv/bin/activate

pip install --quiet --upgrade pip
pip install --quiet python-dotenv
pip install --quiet fastapi
pip install --quiet uvicorn
pip install --quiet transformers
pip install --quiet torch
pip install --quiet accelerate

echo "✅ Dependencies installed"
DEPS

echo "✅ Setup complete"
echo ""

# Start service
echo "Starting classifier service..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" ubuntu@$IP <<'START'
source venv/bin/activate
nohup python classifier_service.py > classifier.log 2>&1 &
sleep 30
echo "✅ Service started"
START

echo "Waiting for service to initialize..."
sleep 10

# Health check
HEALTH=$(curl -s http://$IP:8766/health 2>/dev/null || echo "not ready")
if [[ "$HEALTH" == *"ok"* ]]; then
    echo "✅ Classifier service: OK"
else
    echo "⚠️  Service may still be loading..."
fi

echo ""
echo "========================================================================"
echo "DEPLOYMENT COMPLETE"
echo "========================================================================"
echo ""
echo "✅ Classifier Service deployed on GPU!"
echo ""
echo "Instance Details:"
echo "  ID: $INSTANCE_ID"
echo "  IP: $IP"
echo "  Type: g4dn.xlarge (NVIDIA T4)"
echo "  Cost: ~\$0.526/hour"
echo ""
echo "Service:"
echo "  URL: http://$IP:8766"
echo "  Health: http://$IP:8766/health"
echo ""
echo "Expected Performance:"
echo "  Tokens/sec: ~200-300 (vs 13 on CPU)"
echo "  Speedup: 15-23x faster"
echo "  Batch 10: ~1-2 seconds (vs 30s)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 CONNECT QDRANT SERVICE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Update Qdrant service environment:"
echo "  export CLASSIFIER_SERVICE_URL=http://$IP:8766"
echo ""
echo "Or SSH to Qdrant instance and update:"
echo "  echo 'CLASSIFIER_SERVICE_URL=http://$IP:8766' >> ~/hybrid-memory/.env"
echo "  # Then restart Qdrant service"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🛑 TERMINATE INSTANCE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  AWS_PROFILE=work aws ec2 terminate-instances --instance-ids $INSTANCE_ID"
echo ""

# Save instance details
cat > classifier-gpu-instance.env <<EOF
export CLASSIFIER_INSTANCE=$INSTANCE_ID
export CLASSIFIER_IP=$IP
export CLASSIFIER_TYPE=$INSTANCE_TYPE
export CLASSIFIER_URL=http://$IP:8766
EOF

echo "Instance details saved to: classifier-gpu-instance.env"
echo ""
