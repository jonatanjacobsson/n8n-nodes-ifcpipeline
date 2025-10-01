#!/bin/bash
# This script builds your custom n8n-nodes-ifcpipeline node and deploys it
# to your local n8n instance running in Docker.
#
# Usage: ./deploy-local.sh

# Exit immediately if a command fails.
set -e

##############################
# Step 0: Configuration
##############################
# Get package name from package.json
PACKAGE_NAME=$(node -p "require('./package.json').name")

if [ -z "$PACKAGE_NAME" ]; then
  echo "Error: Could not determine package name from package.json."
  exit 1
fi

# Set paths
SOURCE_DIR="./dist"
TARGET_DIR="../ifc-pipeline/n8n-data/custom/$PACKAGE_NAME"
DOCKER_COMPOSE_DIR="../ifc-pipeline"

echo "========================================"
echo "Deploying Custom n8n Node"
echo "========================================"
echo "Package name: '$PACKAGE_NAME'"
echo "Source directory: '$SOURCE_DIR'"
echo "Target directory: '$TARGET_DIR'"
echo ""

##############################
# Step 1: Build the Node
##############################
echo "Building the node..."
pnpm run build

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: Build directory '$SOURCE_DIR' not found."
  exit 1
fi

echo "✓ Build complete."
echo ""

##############################
# Step 2: Deploy the Build Output
##############################
echo "Deploying build output to n8n custom nodes directory..."

# Remove previous deployment
if [ -d "$TARGET_DIR" ]; then
  rm -rf "$TARGET_DIR"
  echo "  - Removed previous deployment"
fi

# Create target directory
mkdir -p "$TARGET_DIR"

# Copy package.json and dist files
cp package.json "$TARGET_DIR/"
cp -r "$SOURCE_DIR/"* "$TARGET_DIR/"

echo "✓ Deployment complete."
echo ""

##############################
# Step 3: Restart n8n Container
##############################
echo "Restarting n8n container..."
cd "$DOCKER_COMPOSE_DIR"
docker compose restart n8n

echo ""
echo "========================================"
echo "✓ Deployment successful!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Wait ~10-15 seconds for n8n to fully restart"
echo "  2. Open n8n at http://localhost:5678"
echo "  3. Your custom IFC Pipeline nodes should be available"
echo ""
echo "To view n8n logs, run:"
echo "  docker logs -f n8n"
echo ""


