#!/bin/bash
# Build the custom n8n-nodes-ifcpipeline node and deploy it to a local
# ifcpipeline stack running under docker compose.
#
# Usage:
#   ./deploy-local.sh                     # default: object-storage variant
#   ./deploy-local.sh objectstorage       # explicit
#   ./deploy-local.sh legacy              # classic filesystem stack (not supported by 0.7+)
#   IFCPIPELINE_ROOT=/path/to/stack ./deploy-local.sh
#
# Starting with 0.7.0 this package targets ifcpipeline deployments with
# USE_OBJECT_STORAGE=true. Deploying into a legacy filesystem-only stack
# will technically install the files but the workflows will fail at
# runtime — the script still allows it for backwards compatibility.

set -e

##############################
# Step 0: Configuration
##############################
PACKAGE_NAME=$(node -p "require('./package.json').name")

if [ -z "$PACKAGE_NAME" ]; then
  echo "Error: Could not determine package name from package.json."
  exit 1
fi

# Resolve target stack. Priority: IFCPIPELINE_ROOT env > $1 arg > default.
if [ -n "$IFCPIPELINE_ROOT" ]; then
  DOCKER_COMPOSE_DIR="$IFCPIPELINE_ROOT"
else
  case "${1:-objectstorage}" in
    objectstorage|object-storage|s3|minio)
      DOCKER_COMPOSE_DIR="../ifcpipeline-objectstorage"
      ;;
    legacy|filesystem|fs)
      DOCKER_COMPOSE_DIR="../ifcpipeline"
      echo "WARNING: deploying 0.7+ package into a legacy filesystem stack."
      echo "         Workflows requiring USE_OBJECT_STORAGE=true will fail."
      ;;
    *)
      echo "Unknown variant '$1' (expected 'objectstorage' or 'legacy')."
      exit 1
      ;;
  esac
fi

SOURCE_DIR="./dist"
TARGET_DIR="$DOCKER_COMPOSE_DIR/n8n-data/custom/$PACKAGE_NAME"

echo "========================================"
echo "Deploying Custom n8n Node"
echo "========================================"
echo "Package name:       '$PACKAGE_NAME'"
echo "Source directory:   '$SOURCE_DIR'"
echo "ifcpipeline root:   '$DOCKER_COMPOSE_DIR'"
echo "Target directory:   '$TARGET_DIR'"
echo ""

if [ ! -d "$DOCKER_COMPOSE_DIR" ]; then
  echo "Error: ifcpipeline root '$DOCKER_COMPOSE_DIR' does not exist."
  exit 1
fi

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

if [ -d "$TARGET_DIR" ]; then
  rm -rf "$TARGET_DIR"
  echo "  - Removed previous deployment"
fi

mkdir -p "$TARGET_DIR"

cp package.json "$TARGET_DIR/"
cp -r "$SOURCE_DIR/"* "$TARGET_DIR/"

echo "✓ Deployment complete."
echo ""

##############################
# Step 3: (Re)start n8n Container
##############################
echo "Ensuring n8n container is up..."
cd "$DOCKER_COMPOSE_DIR"

# If n8n is already running, restart it to pick up the new package.
# Otherwise bring it up.
if docker compose ps --services --status=running 2>/dev/null | grep -q '^n8n$'; then
  docker compose restart n8n
else
  docker compose up -d n8n
fi

echo ""
echo "========================================"
echo "✓ Deployment successful!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Wait ~10-15 seconds for n8n to fully restart"
echo "  2. Open n8n — object-storage stack listens on http://localhost:5778"
echo "     (legacy stack: http://localhost:5678)"
echo "  3. Your custom IFC Pipeline nodes should be available"
echo ""
echo "To view n8n logs:"
echo "  docker compose -f $DOCKER_COMPOSE_DIR/docker-compose.yml logs -f n8n"
echo ""
