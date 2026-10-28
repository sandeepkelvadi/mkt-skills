#!/bin/bash
# WordPress Local → Live Content Sync
# Exports page content from local Docker DB, downloads images, prepares for live push.
#
# Usage:
#   ./sync-local-to-live.sh --local-url http://localhost:8088 --live-url https://www.example.com \
#     --db-container skcom-db-1 --db-user wpuser --db-pass wppass --db-name wordpress \
#     --page-slug photography --output-dir /tmp/wp-sync

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Defaults
DRY_RUN=false
OUTPUT_DIR="/tmp/wp-sync"

usage() {
  echo "Usage: $0 [options]"
  echo ""
  echo "Options:"
  echo "  --local-url URL        Local site URL (e.g., http://localhost:8088)"
  echo "  --live-url URL         Live site URL (e.g., https://www.example.com)"
  echo "  --db-container NAME    Docker DB container name"
  echo "  --db-user USER         DB username"
  echo "  --db-pass PASS         DB password"
  echo "  --db-name NAME         DB name"
  echo "  --page-slug SLUG       Page slug to sync (e.g., photography)"
  echo "  --output-dir DIR       Output directory (default: /tmp/wp-sync)"
  echo "  --dry-run              Show what would be done without executing"
  echo ""
  echo "Example:"
  echo "  $0 --local-url http://localhost:8088 --live-url https://www.example.com \\"
  echo "    --db-container skcom-db-1 --db-user wpuser --db-pass wppass --db-name wordpress \\"
  echo "    --page-slug photography"
  exit 1
}

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --local-url) LOCAL_URL="$2"; shift 2 ;;
    --live-url) LIVE_URL="$2"; shift 2 ;;
    --db-container) DB_CONTAINER="$2"; shift 2 ;;
    --db-user) DB_USER="$2"; shift 2 ;;
    --db-pass) DB_PASS="$2"; shift 2 ;;
    --db-name) DB_NAME="$2"; shift 2 ;;
    --page-slug) PAGE_SLUG="$2"; shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

# Validate required args
for var in LOCAL_URL LIVE_URL DB_CONTAINER DB_USER DB_PASS DB_NAME PAGE_SLUG; do
  if [ -z "${!var:-}" ]; then
    echo -e "${RED}Error: --${var,,} is required${NC}"
    usage
  fi
done

mkdir -p "$OUTPUT_DIR/images"

echo -e "${BLUE}━━━ WordPress Content Sync ━━━${NC}"
echo -e "Local:  ${LOCAL_URL}"
echo -e "Live:   ${LIVE_URL}"
echo -e "Page:   ${PAGE_SLUG}"
echo -e "Output: ${OUTPUT_DIR}"
echo ""

# ━━━ Step 1: Export page content from local DB ━━━
echo -e "${YELLOW}[1/6] Exporting page content from local DB...${NC}"

CONTENT_FILE="$OUTPUT_DIR/${PAGE_SLUG}-content.txt"
docker exec "$DB_CONTAINER" mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -N -e \
  "SELECT post_content FROM wp_posts WHERE post_name='$PAGE_SLUG' AND post_status='publish' AND post_type='page' ORDER BY ID DESC LIMIT 1" \
  2>/dev/null > "$CONTENT_FILE"

CONTENT_SIZE=$(wc -c < "$CONTENT_FILE" | tr -d ' ')
if [ "$CONTENT_SIZE" -eq 0 ]; then
  echo -e "${RED}Error: No content found for page '$PAGE_SLUG'${NC}"
  exit 1
fi
echo -e "${GREEN}  Exported ${CONTENT_SIZE} bytes${NC}"

# ━━━ Step 2: Clean content (unescape + URL replace) ━━━
echo -e "${YELLOW}[2/6] Cleaning content (unescape \\n, replace URLs)...${NC}"

PAYLOAD_FILE="$OUTPUT_DIR/${PAGE_SLUG}-payload.json"
python3 << PYEOF
import json, re

with open('$CONTENT_FILE', encoding='latin-1') as f:
    content = f.read()

# Replace local URLs with live URLs
local_url = '$LOCAL_URL'
live_url = '$LIVE_URL'
content = content.replace(local_url, live_url)

# Count potential issues
backslash_n = content.count('\\\\n')
print(f"  URL replacements: {content.count(live_url)} live URLs")
print(f"  Escaped \\\\n found: {backslash_n} (will be unescaped after push if needed)")

# Extract image URLs
imgs = sorted(set(re.findall(r'wp-content/uploads/[^\"\s]+\.(jpg|jpeg|png|webp)', content)))
# Plain file names only: no slashes or "..", so a name cannot write outside images/.
img_filenames = sorted(set(re.findall(r'wp-content/uploads/\d{4}/\d{2}/([A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z0-9]+)', content)))

with open('$PAYLOAD_FILE', 'w') as f:
    json.dump({'content': content}, f)

with open('$OUTPUT_DIR/image-list.txt', 'w') as f:
    for img in img_filenames:
        f.write(img + '\n')

print(f"  Unique images referenced: {len(img_filenames)}")
print(f"  Payload saved: $PAYLOAD_FILE")
PYEOF

# ━━━ Step 3: Check which images exist on live ━━━
echo -e "${YELLOW}[3/6] Checking which images exist on live...${NC}"

MISSING_FILE="$OUTPUT_DIR/missing-images.txt"
EXISTING=0
MISSING=0
> "$MISSING_FILE"

while IFS= read -r img; do
  # Try to find the upload path from the content
  UPLOAD_PATH=$(grep -o "wp-content/uploads/[0-9]*/[0-9]*/${img}" "$CONTENT_FILE" | head -1)
  if [ -z "$UPLOAD_PATH" ]; then
    UPLOAD_PATH="wp-content/uploads/2026/03/${img}"
  fi

  CODE=$(curl -s -o /dev/null -w "%{http_code}" "${LIVE_URL}/${UPLOAD_PATH}" 2>/dev/null)
  if [ "$CODE" = "200" ]; then
    EXISTING=$((EXISTING + 1))
  else
    MISSING=$((MISSING + 1))
    echo "$img" >> "$MISSING_FILE"
  fi
done < "$OUTPUT_DIR/image-list.txt"

echo -e "${GREEN}  Existing on live: ${EXISTING}${NC}"
if [ "$MISSING" -gt 0 ]; then
  echo -e "${RED}  Missing on live: ${MISSING}${NC}"
else
  echo -e "${GREEN}  Missing on live: 0 — all images present!${NC}"
fi

# ━━━ Step 4: Download missing images from local ━━━
if [ "$MISSING" -gt 0 ]; then
  echo -e "${YELLOW}[4/6] Downloading ${MISSING} missing images from local...${NC}"

  DOWNLOADED=0
  FAILED=0
  while IFS= read -r img; do
    UPLOAD_PATH=$(grep -o "wp-content/uploads/[0-9]*/[0-9]*/${img}" "$CONTENT_FILE" | head -1)
    if [ -z "$UPLOAD_PATH" ]; then
      UPLOAD_PATH="wp-content/uploads/2026/03/${img}"
    fi

    if [ "$DRY_RUN" = true ]; then
      echo "  [DRY RUN] Would download: $img"
    else
      CODE=$(curl -s -o "$OUTPUT_DIR/images/$img" -w "%{http_code}" "${LOCAL_URL}/${UPLOAD_PATH}")
      if [ "$CODE" = "200" ]; then
        DOWNLOADED=$((DOWNLOADED + 1))
      else
        FAILED=$((FAILED + 1))
        echo -e "  ${RED}Failed: $img (HTTP $CODE)${NC}"
      fi
    fi
  done < "$MISSING_FILE"

  if [ "$DRY_RUN" = false ]; then
    echo -e "${GREEN}  Downloaded: ${DOWNLOADED}, Failed: ${FAILED}${NC}"
  fi
else
  echo -e "${YELLOW}[4/6] No images to download — skipping.${NC}"
fi

# ━━━ Step 5: Check live page exists ━━━
echo -e "${YELLOW}[5/6] Checking live page status...${NC}"

LIVE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${LIVE_URL}/${PAGE_SLUG}/")
echo -e "  ${LIVE_URL}/${PAGE_SLUG}/ → HTTP ${LIVE_STATUS}"

if [ "$LIVE_STATUS" != "200" ]; then
  echo -e "${RED}  Warning: Live page returned ${LIVE_STATUS}, not 200${NC}"
fi

# ━━━ Step 6: Generate push instructions ━━━
echo -e "${YELLOW}[6/6] Generating push instructions...${NC}"

cat > "$OUTPUT_DIR/push-instructions.md" << 'MDEOF'
# Push Content to Live

## Step 1: Upload missing images
Upload images from the `images/` folder to WP Admin → Media → Add New.

## Step 2: Push page content
Run this in the browser console on WP Admin:

```javascript
// 1. Start a local HTTP server (run in terminal):
// cd OUTPUT_DIR && python3 -m http.server 9876

// 2. In WP Admin console, get nonce:
const nonceResp = await fetch('/wp-admin/admin-ajax.php?action=rest-nonce', {credentials:'same-origin'});
const nonce = await nonceResp.text();

// 3. Load content from local server:
const script = document.createElement('script');
script.src = 'http://localhost:9876/inject-content.js';
document.head.appendChild(script);
// Wait for it to load, then:

// 4. Push to page:
const resp = await fetch('/wp-json/wp/v2/pages/PAGE_ID', {
  method: 'POST', credentials: 'same-origin',
  headers: {'Content-Type':'application/json', 'X-WP-Nonce': nonce},
  body: JSON.stringify({content: window.__content})
});
console.log(resp.ok ? 'SUCCESS' : 'FAILED: ' + resp.status);
```

## Step 3: Verify
Check all pages for broken images (run in browser console):
```javascript
const resp = await fetch('/PAGE_SLUG/');
const html = await resp.text();
const imgs = [...new Set(html.match(/wp-content\/uploads\/[^"'\s]+\.(jpg|png|jpeg|webp)/g) || [])];
let broken = 0;
for (const img of imgs) {
  const r = await fetch('/' + img, {method:'HEAD'});
  if (r.status >= 400) { broken++; console.log('BROKEN:', img); }
}
console.log(`Total: ${imgs.length}, Broken: ${broken}`);
```
MDEOF

# Generate injectable JS file
python3 << PYEOF2
import json
with open('$PAYLOAD_FILE') as f:
    payload = json.load(f)
content = payload['content']
js = f"window.__content = {json.dumps(content)};\nwindow.__ready = true;\nconsole.log('Content loaded: ' + window.__content.length + ' chars');\n"
with open('$OUTPUT_DIR/inject-content.js', 'w') as f:
    f.write(js)
print(f"  inject-content.js created ({len(js)} bytes)")
PYEOF2

# Replace placeholders in instructions
sed -i '' "s|OUTPUT_DIR|$OUTPUT_DIR|g" "$OUTPUT_DIR/push-instructions.md" 2>/dev/null || true
sed -i '' "s|PAGE_SLUG|$PAGE_SLUG|g" "$OUTPUT_DIR/push-instructions.md" 2>/dev/null || true

echo ""
echo -e "${BLUE}━━━ Summary ━━━${NC}"
echo -e "  Content:  ${CONTENT_SIZE} bytes exported and cleaned"
echo -e "  Images:   ${EXISTING} existing, ${MISSING} missing"
echo -e "  Output:   ${OUTPUT_DIR}/"
echo -e "    ├── ${PAGE_SLUG}-content.txt     (raw DB export)"
echo -e "    ├── ${PAGE_SLUG}-payload.json    (cleaned, ready to push)"
echo -e "    ├── inject-content.js            (browser-injectable JS)"
echo -e "    ├── image-list.txt               (all referenced images)"
echo -e "    ├── missing-images.txt           (images to upload)"
echo -e "    ├── images/                      (downloaded missing images)"
echo -e "    └── push-instructions.md         (step-by-step push guide)"
echo ""

if [ "$MISSING" -gt 0 ]; then
  echo -e "${YELLOW}Next steps:${NC}"
  echo -e "  1. Upload images from ${OUTPUT_DIR}/images/ to live Media Library"
  echo -e "  2. Start local server: cd ${OUTPUT_DIR} && python3 -m http.server 9876"
  echo -e "  3. Follow push-instructions.md to push content via browser console"
  echo -e "  4. Verify: check all pages for broken images"
else
  echo -e "${YELLOW}Next steps:${NC}"
  echo -e "  1. Start local server: cd ${OUTPUT_DIR} && python3 -m http.server 9876"
  echo -e "  2. Follow push-instructions.md to push content via browser console"
  echo -e "  3. Verify: check all pages for broken images"
fi

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${YELLOW}[DRY RUN] No files were downloaded. Remove --dry-run to execute.${NC}"
fi
