#!/usr/bin/env bash
# Bump version across all config files, commit, tag, and push.
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 0.3.0

set -euo pipefail

VERSION="${1:?Usage: ./scripts/release.sh <version>}"

# Strip leading "v" if provided
VERSION="${VERSION#v}"

echo "Releasing v${VERSION}..."

# Bump package.json
npm version "$VERSION" --no-git-tag-version --allow-same-version

# Bump server.json
jq --arg v "$VERSION" '.version = $v | .packages[0].version = $v' server.json > server.tmp && mv server.tmp server.json

# Bump manifest.json
jq --arg v "$VERSION" '.version = $v' manifest.json > manifest.tmp && mv manifest.tmp manifest.json

# Commit, tag, push
git add package.json package-lock.json server.json manifest.json
git commit -m "v${VERSION}"
git tag "v${VERSION}"
git push origin main "v${VERSION}"

echo "Done - v${VERSION} tagged and pushed."
