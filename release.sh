#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_JSON="$PROJECT_DIR/frontend/package.json"
DOC_FILE="$PROJECT_DIR/DOKUMENTATION.md"
RELEASES_DIR="$PROJECT_DIR/releases"

if [ -z "${1:-}" ]; then
    echo "ERROR: Please provide a release description."
    echo "Usage: ./release.sh \"Description of changes\""
    exit 1
fi

RELEASE_NOTES_TEXT="$1"
CURRENT_VERSION=$(python3 -c "import json; print(json.load(open('$PACKAGE_JSON'))['version'])")
echo "Current version: $CURRENT_VERSION"

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"
echo "New version:     $NEW_VERSION"

python3 -c "
import json
path = '$PACKAGE_JSON'
with open(path, 'r') as f:
    data = json.load(f)
data['version'] = '$NEW_VERSION'
with open(path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
"
echo "package.json updated."

TODAY=$(date +%d.%m.%Y)

sed -i "s/^\*\*Version:\*\* .*/\*\*Version:\*\* $NEW_VERSION/" "$DOC_FILE"
sed -i "s/^\*\*Date:\*\* .*/\*\*Date:\*\* $TODAY/" "$DOC_FILE"

CHANGELOG_ENTRY="### v$NEW_VERSION ($TODAY)\n- $RELEASE_NOTES_TEXT\n"
sed -i "/^## Changelog$/a\\\n$CHANGELOG_ENTRY" "$DOC_FILE"
echo "Documentation updated."

mkdir -p "$RELEASES_DIR"
RELEASE_FILE="$RELEASES_DIR/v${NEW_VERSION}.md"

cat > "$RELEASE_FILE" << EOF
# GonoPBX v${NEW_VERSION}

**Date:** ${TODAY}
**Previous version:** ${CURRENT_VERSION}

---

## Changes

${RELEASE_NOTES_TEXT}

---

## Deployment

```bash
# Rebuild and deploy the frontend

docker compose build frontend && docker compose up -d frontend

# Restart the backend if needed

docker restart pbx_backend
```
EOF

echo "Release notes created: $RELEASE_FILE"
echo ""
echo "==================================="
echo " Release v$NEW_VERSION created"
echo "==================================="
echo "  package.json:      $NEW_VERSION"
echo "  documentation:     updated"
echo "  release notes:     $RELEASE_FILE"
echo ""
echo "Next steps:"
echo "  docker compose build frontend && docker compose up -d frontend"
