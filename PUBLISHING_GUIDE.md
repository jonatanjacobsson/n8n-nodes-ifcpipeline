# Publishing n8n-nodes-ifcpipeline to NPM

## Current Status

**Current Version**: 0.1.4  
**Next Version**: 0.2.0 (adding IfcPatch node)  
**Package Name**: n8n-nodes-ifcpipeline

---

## Prerequisites

### 1. NPM Account Setup

If you don't have an npm account yet:

```bash
# Create account at https://www.npmjs.com/signup

# Or via CLI
npm adduser
```

### 2. Login to NPM

```bash
# Login to your npm account
npm login

# Verify you're logged in
npm whoami

# Should display your npm username
```

### 3. Two-Factor Authentication (2FA)

If you have 2FA enabled on npm (recommended):
- You'll need your authentication app ready
- npm will prompt for your OTP (One-Time Password) during publish

---

## Publishing Steps

### Step 1: Update Version Number

Since we added a new node (IfcPatch), this is a **minor version bump**:

```bash
cd /home/bimbot-ubuntu/apps/n8n-nodes-ifcpipeline

# Bump version from 0.1.4 to 0.2.0
pnpm version minor

# Or manually edit package.json and change version to "0.2.0"
```

**Semantic Versioning Guide:**
- **Major (1.0.0)**: Breaking changes
- **Minor (0.2.0)**: New features (backward compatible) ← We're here
- **Patch (0.1.5)**: Bug fixes

### Step 2: Update CHANGELOG (Optional but Recommended)

Create or update `CHANGELOG.md`:

```bash
cat >> CHANGELOG.md << 'EOF'

## [0.2.0] - 2025-01-01

### Added
- **IfcPatch Node**: Execute IfcPatch recipes (built-in and custom)
  - Execute Recipe operation with job polling
  - List Available Recipes operation
  - Support for 45+ built-in recipes
  - Custom recipe execution support
  - Dynamic arguments configuration
  - Automatic job completion polling
  - Configurable timeout and polling interval

### Changed
- Updated package dependencies

### Documentation
- Added IfcPatch node README
- Added N8N_IFCPATCH_NODE_SUMMARY.md
- Updated main documentation

EOF
```

### Step 3: Clean and Build

```bash
cd /home/bimbot-ubuntu/apps/n8n-nodes-ifcpipeline

# Clean previous builds
rm -rf dist/

# Install dependencies (if needed)
pnpm install

# Build the package
pnpm build

# Verify build succeeded
ls -la dist/nodes/IfcPatch/
```

### Step 4: Lint and Validate

```bash
# Run linter
pnpm lint

# Fix any linting issues
pnpm lintfix

# The prepublishOnly script will run these automatically,
# but it's good to check beforehand
```

### Step 5: Test the Package Locally (Optional)

Test the package before publishing:

```bash
# Create a test tarball
npm pack

# This creates n8n-nodes-ifcpipeline-0.2.0.tgz

# You can install this locally in n8n to test:
# npm install /path/to/n8n-nodes-ifcpipeline-0.2.0.tgz
```

### Step 6: Commit Changes (If using Git)

```bash
# Commit the version bump and new files
git add .
git commit -m "Release v0.2.0: Add IfcPatch node"

# Tag the release
git tag v0.2.0

# Push to GitHub
git push origin main
git push origin v0.2.0
```

### Step 7: Publish to NPM

```bash
# Publish the package
pnpm publish

# Or use npm
npm publish

# If you have 2FA enabled, you'll be prompted for your OTP
# Enter the 6-digit code from your authenticator app
```

**What happens during publish:**

1. `prepublishOnly` script runs:
   - Builds TypeScript (`pnpm build`)
   - Runs linter (`pnpm lint`)
2. Package is uploaded to npm registry
3. Package becomes available at: https://www.npmjs.com/package/n8n-nodes-ifcpipeline

### Step 8: Verify Publication

```bash
# Check the published package
npm view n8n-nodes-ifcpipeline

# Check specific version
npm view n8n-nodes-ifcpipeline@0.2.0

# Visit npm page
open https://www.npmjs.com/package/n8n-nodes-ifcpipeline
```

---

## Complete Publishing Script

Here's a complete script to automate the process:

```bash
#!/bin/bash
# publish.sh - Automated publishing script

set -e  # Exit on error

echo "🚀 Publishing n8n-nodes-ifcpipeline"
echo "===================================="

# Navigate to package directory
cd /home/bimbot-ubuntu/apps/n8n-nodes-ifcpipeline

# Check if logged in
echo "✓ Checking npm authentication..."
npm whoami || { echo "❌ Not logged in to npm. Run 'npm login' first."; exit 1; }

# Clean
echo "✓ Cleaning previous builds..."
rm -rf dist/

# Install dependencies
echo "✓ Installing dependencies..."
pnpm install

# Bump version
echo "✓ Bumping version..."
pnpm version minor --no-git-tag-version

# Build
echo "✓ Building package..."
pnpm build

# Lint
echo "✓ Running linter..."
pnpm lint

# Show what will be published
echo "✓ Package contents:"
npm pack --dry-run

# Confirm
read -p "📦 Ready to publish. Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Publish cancelled"
    exit 1
fi

# Publish
echo "✓ Publishing to npm..."
pnpm publish

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")

echo "✅ Successfully published v${NEW_VERSION}!"
echo "📦 View at: https://www.npmjs.com/package/n8n-nodes-ifcpipeline"
```

Save and run:

```bash
chmod +x publish.sh
./publish.sh
```

---

## Post-Publication

### 1. Update Documentation

Update any references to the version:
- README.md
- Documentation sites
- Release notes

### 2. Announce the Release

Consider announcing on:
- GitHub Releases page
- n8n Community Forum
- Social media / Blog

### 3. Monitor npm Downloads

Track your package:
- npm downloads: https://npm-stat.com/charts.html?package=n8n-nodes-ifcpipeline
- npm trends: https://npmtrends.com/n8n-nodes-ifcpipeline

### 4. Tag GitHub Release

Create a GitHub release with release notes:

```bash
# On GitHub, go to:
# https://github.com/jonatanjacobsson/n8n-nodes-ifcpipeline/releases/new

# Tag: v0.2.0
# Title: Release v0.2.0 - IfcPatch Node
# Description: Add release notes from CHANGELOG.md
```

---

## Installing Your Published Package

After publishing, users can install it:

```bash
# In n8n installation directory
npm install n8n-nodes-ifcpipeline@latest

# Or specific version
npm install n8n-nodes-ifcpipeline@0.2.0

# Restart n8n
# The new nodes will be available
```

---

## Troubleshooting

### "You do not have permission to publish"

**Solution:**
- Verify you're logged in: `npm whoami`
- Check package name isn't taken
- Verify you have publish rights to the package

### "Package name too similar to existing package"

**Solution:**
- npm prevents publishing packages with very similar names
- Contact npm support if this is your legitimate package

### "402 Payment Required"

**Solution:**
- For scoped packages (@yourname/package), you need a paid npm account
- Or make the package public in package.json

### Build Errors

**Solution:**
```bash
# Clean everything
rm -rf node_modules/ dist/ pnpm-lock.yaml
pnpm install
pnpm build
```

### Linting Errors

**Solution:**
```bash
# Auto-fix what can be fixed
pnpm lintfix

# Review remaining errors
pnpm lint
```

---

## Unpublishing (Emergency Only)

If you need to remove a version (only works within 72 hours):

```bash
# Unpublish a specific version
npm unpublish n8n-nodes-ifcpipeline@0.2.0

# Unpublish entire package (use with extreme caution!)
npm unpublish n8n-nodes-ifcpipeline --force
```

⚠️ **Warning**: Unpublishing can break projects that depend on your package!

---

## Publishing Checklist

Before publishing, verify:

- [ ] Version number bumped appropriately
- [ ] All files built successfully (`dist/` folder populated)
- [ ] Linter passes without errors
- [ ] New IfcPatch node files present in dist/
- [ ] package.json updated with new node registration
- [ ] CHANGELOG.md updated (optional but recommended)
- [ ] Tested locally (optional but recommended)
- [ ] Git changes committed and tagged
- [ ] Logged in to npm (`npm whoami` works)
- [ ] Ready for 2FA code if enabled

---

## Quick Reference Commands

```bash
# Setup
npm login
npm whoami

# Version bump
pnpm version minor  # 0.1.4 → 0.2.0

# Build & test
rm -rf dist/
pnpm install
pnpm build
pnpm lint

# Publish
pnpm publish

# Verify
npm view n8n-nodes-ifcpipeline@latest
```

---

## Support

For issues with publishing:
- npm support: https://www.npmjs.com/support
- npm documentation: https://docs.npmjs.com/
- n8n community nodes: https://docs.n8n.io/integrations/community-nodes/

---

**Last Updated**: 2025-01-01  
**Current Version**: 0.1.4  
**Target Version**: 0.2.0
