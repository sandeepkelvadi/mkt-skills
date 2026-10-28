---
name: wp-migration
description: Migrate a WordPress site from local dev to live hosting, or sync content between environments. Use when the user asks to move, deploy or sync a WordPress site.
---

# WordPress Migration — Local to Live

Comprehensive workflow for migrating WordPress sites from local dev to live hosting, or syncing content between environments.

## When to Use

- Migrating a full WordPress site from local (DevKinsta, Docker, LocalWP) to live hosting
- Syncing specific pages/content from local to an existing live site
- Moving a site between hosting providers
- User says "migrate", "sync to live", "push to production", "deploy site"

## Pre-Migration Checklist

Before touching anything:

1. **Hosting details** — FTP/SSH credentials, cPanel access, provider type (WPEngine, Kinsta, SiteGround, WordPress.com)
2. **Domain details** — Registrar, DNS access, current A/CNAME records
3. **Email details** — MX records, GSuite/provider info (don't break email!)
4. **PHP version** — Must match local and live (or live 1 level lower max)
5. **WordPress version** — Same or 1 level lower on live
6. **SSL** — Verify for both `domain.com` AND `www.domain.com`
7. **Freeze content** — Ask client/owner to stop editing until migration complete
8. **Fresh backup** — Take backup of BOTH local and live before starting
9. **Cache plugins** — Note which are active, may need to deactivate during migration
10. **Add `www` variant** — Ensure `www.sitename.com` is added when configuring domain

## Migration Methods

### Method 1: BlogVault (Full Site Migration)

Best for: Moving entire site between hosts.

1. Take fresh backup in BlogVault of both staging and live
2. Check PHP version matches on both environments
3. Get live site FTP details
4. Install WordPress on live (recommended: don't override existing)
5. Add "Under Construction" page (logo + message)
6. In BlogVault → select Migrate under staging site
7. Enter FTP details → Select folder → Set destination URL → Continue
8. After migration: Install **Better Search Replace** plugin
9. Replace URLs:
   - `https://oldurl.com` → `https://newurl.com`
   - `http://oldurl.com` → `https://newurl.com`

### Method 2: Manual Migration (FTP + DB)

Best for: When BlogVault fails or isn't available.

1. Download latest backup from staging/local
2. **Clean WPEngine mu-plugins** (if migrating from WPEngine):
   ```
   DELETE these files:
   wp-content/mu-plugins/wpe-wp-sign-on-plugin/
   wp-content/mu-plugins/wpe-wp-sign-on-plugin.php
   wp-content/mu-plugins/wpengine-security-auditor.php
   wp-content/advanced-cache.php
   wp-content/object-cache.php
   ```
3. Upload wp-content folder via FTP/cPanel File Manager
4. Import database via phpMyAdmin:
   - Drop all existing tables in live DB
   - Import the .sql file from backup
5. Update `siteurl` and `home` in `wp_options` table
6. Use Better Search Replace for full URL replacement

### Method 3: REST API Content Sync (Pages Only)

Best for: Syncing specific page content to an existing live site. This is what we use most often.

**Critical: Follow this exact order.**

#### Step 1: Compare Content

Always compare local vs live BEFORE making changes:

```bash
# Get local page content length
docker exec $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -N -e \
  "SELECT LENGTH(post_content) FROM wp_posts WHERE post_name='$SLUG' AND post_status='publish' AND post_type='page' ORDER BY ID DESC LIMIT 1"

# Compare with live (via browser JS console on WP admin)
# fetch('/wp-json/wp/v2/pages?slug=SLUG&context=edit&_fields=content', {credentials:'same-origin', headers:{'X-WP-Nonce': nonce}})
```

#### Step 2: Export & Clean Content

```bash
# Export from local Docker DB
docker exec $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -N -e \
  "SELECT post_content FROM wp_posts WHERE post_name='$SLUG' AND post_status='publish' AND post_type='page' ORDER BY ID DESC LIMIT 1" \
  > /tmp/page-content.txt

# CRITICAL: Unescape MySQL output
python3 -c "
with open('/tmp/page-content.txt', encoding='latin-1') as f:
    content = f.read()
content = content.replace('http://localhost:PORT', 'https://livesite.com')
# MySQL escapes newlines as literal \n — must decode
import json
with open('/tmp/page-payload.json', 'w') as f:
    json.dump({'content': content}, f)
"
```

**GOTCHA:** MySQL `SELECT` output escapes `\n` as literal two-character strings. If you push this directly via REST API, the page will show `\n\n\n\n` as visible text. Always unescape before pushing.

**PREFERRED METHOD — Use WP-CLI instead of MySQL:**
```bash
# Install WP-CLI in the container (if not present)
docker exec $CONTAINER bash -c "curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp"

# Export clean content — no escaping issues
docker exec $CONTAINER wp post get $(docker exec $CONTAINER wp post list --post_type=page --name=$SLUG --field=ID --allow-root 2>/dev/null) --field=post_content --allow-root > /tmp/page-content.txt
```
WP-CLI outputs raw block content with real newlines — no `\n` escaping, no `latin-1` encoding issues. This is the safest way to extract content for syncing. Only fall back to MySQL `SELECT` if WP-CLI is unavailable.

#### Step 3: Upload Images First

```bash
# Extract image URLs from content
python3 -c "
import re
with open('/tmp/page-content.txt', encoding='latin-1') as f:
    content = f.read()
urls = sorted(set(re.findall(r'http://localhost:\d+/wp-content/uploads/[^\"\s]+', content)))
for u in urls:
    print(u.split('/')[-1])
"

# Download from local
for img in $IMAGE_LIST; do
  curl -s -o "/tmp/images/$img" "http://localhost:PORT/wp-content/uploads/2026/03/$img"
done

# Check which already exist on live (skip duplicates!)
for img in $IMAGE_LIST; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://livesite.com/wp-content/uploads/2026/03/$img")
  if [ "$code" != "200" ]; then echo "UPLOAD: $img"; fi
done
```

Upload missing images via WP Admin → Media → Add New (bulk upload via Playwright file_upload or manually).

#### Step 4: Push Content

From WP Admin browser console:
```javascript
// Get nonce
const nonceResp = await fetch('/wp-admin/admin-ajax.php?action=rest-nonce', {credentials:'same-origin'});
const nonce = await nonceResp.text();

// For large content, inject via script tag from local HTTP server
// python3 -m http.server 9876 (serve the payload file)
// Then in browser: load script that sets window.__content = payload

// Push to page
await fetch('/wp-json/wp/v2/pages/PAGE_ID', {
  method: 'POST', credentials: 'same-origin',
  headers: {'Content-Type':'application/json', 'X-WP-Nonce': nonce},
  body: JSON.stringify({content: window.__content})
});
```

#### Step 5: Verify

```javascript
// Check all pages for broken images
const pages = ['/', '/blog/', '/my-work/', '/talks/', '/photography/', '/books/', '/about/'];
for (const page of pages) {
  const resp = await fetch(page);
  const html = await resp.text();
  const imgs = html.match(/wp-content\/uploads\/[^"'\s]+\.(jpg|png|jpeg|webp)/g) || [];
  const unique = [...new Set(imgs)];
  let broken = 0;
  for (const img of unique) {
    const r = await fetch('/' + img, {method:'HEAD'});
    if (r.status >= 400) broken++;
  }
  console.log(`${page}: ${unique.length} imgs, ${broken} broken`);
}
```

## Template Sync (Block Themes)

For Twenty Twenty-Five and other block themes:

```javascript
// Push template content via REST API
await fetch('/wp-json/wp/v2/templates/twentytwentyfive//archive', {
  method: 'POST', credentials: 'same-origin',
  headers: {'Content-Type':'application/json', 'X-WP-Nonce': nonce},
  body: JSON.stringify({content: templateBlockMarkup})
});

// Reset a template to theme default
// Site Editor → Templates → Select template → Actions → Reset
```

**Navigation menus** in block themes are `wp_navigation` post type — managed via Site Editor, not Appearance → Menus. A single nav menu post is shared across header and footer.

## URL Replacement

For full migrations, use **Better Search Replace** plugin:
- Replace `https://oldurl.com` → `https://newurl.com`
- Replace `http://oldurl.com` → `https://newurl.com`
- For Kinsta: Use built-in Search & Replace tool

For REST API syncs: Replace in content string before pushing.

## WordPress Settings Sync

```bash
# Category base (remove /category/ prefix)
Settings → Permalinks → Category base → set to "."

# Site icon via REST API
POST /wp-json/wp/v2/settings with { site_icon: MEDIA_ID }

# Tagline via REST API
POST /wp-json/wp/v2/settings with { description: "new tagline" }
```

## Post-Live Checklist

### Critical (Do Immediately)
- [ ] DNS/A record propagation — check via https://dnschecker.org/
- [ ] SSL working for `domain.com` AND `www.domain.com`
- [ ] `site_url` and `home` correct in wp-options
- [ ] Uncheck "Discourage search engines" (Settings → Reading)
- [ ] Test domain with and without `www`
- [ ] Check for 302 redirects that should be 301

### Content Verification
- [ ] All pages returning 200
- [ ] All images loading (zero 404s across all pages)
- [ ] All internal links working
- [ ] Navigation menu matches local (header + footer)
- [ ] Forms working (test submission)
- [ ] Responsive check (mobile/tablet)
- [ ] No `\n` or escaped characters visible in page content

### Analytics & SEO
- [ ] Google Tag Manager connected
- [ ] Google Analytics tracking
- [ ] Google Search Console verified
- [ ] Submit sitemap.xml in Search Console
- [ ] Button/event tracking working
- [ ] Yoast SEO — add logo, company details, configure sitemap options

### Cleanup
- [ ] Delete unwanted pages (drafts, duplicates, Sample Page)
- [ ] Delete unwanted themes (keep active + one default)
- [ ] Delete unwanted/inactive plugins
- [ ] Add backup plugin (BlogVault or verify Jetpack backups)
- [ ] Clear all caches (WP Rocket, Jetpack, CDN)

### Performance
- [ ] Cache plugin configured and working
- [ ] Image optimization active (EWWW/ShortPixel)
- [ ] PHP version optimal for hosting plan (SiteGround UltraFast PHP)
- [ ] Disable Contact Form 7 refill if not needed (performance)

## Hosting-Specific Notes

### WPEngine
Delete mu-plugin files after migration:
```
wp-content/mu-plugins/wpe-wp-sign-on-plugin/
wp-content/mu-plugins/wpe-wp-sign-on-plugin.php
wp-content/mu-plugins/wpengine-security-auditor.php
wp-content/advanced-cache.php
wp-content/object-cache.php
```
Deploy from staging to live ONLY within WPEngine. If using WP Rocket, follow their staging URL cleanup guide.

### Kinsta
1. Add site/domain in Kinsta dashboard
2. Verify domain with TXT records (Kinsta provides)
3. Point domain with A record (Kinsta provides)
4. Set as primary domain
5. For Cloudflare: Add CNAME record (`Name: @` or subdomain, `Target: username.hosting.kinsta.cloud`, Proxied)
6. For www variant: Add separate CNAME (`Name: www`, same target)
7. Use Kinsta's built-in Search & Replace tool (no plugin needed)

### WordPress.com / Jetpack
- Images served via Photon CDN (`i0.wp.com`)
- Photon caches 404 responses — if images were missing before upload, add `?v=2` cache-busting parameter to image URLs
- Site Icon set via REST API: `POST /wp-json/wp/v2/settings` with `{site_icon: ID}`

### SiteGround
- PHP update available for GoGeek/Cloud plans (UltraFast PHP)
- Use their staging tools for test deployments

## Common Gotchas (Learned the Hard Way)

1. **Always compare page content before fixing images** — Local is the source of truth. Don't upload images for outdated live content.
2. **EWWW converts PNG→JPG on upload** — After upload, verify actual filenames match what the page content references. Fix with find-replace via REST API.
3. **Photon CDN caches stale 404s** — Add `?v=2` to image URLs in block content to force CDN refresh.
4. **MySQL exports escape newlines** — `\n` becomes literal two characters. Unescape before pushing to live or you'll see `\n\n\n` on the page. **Use WP-CLI `wp post get --field=post_content` instead** — it outputs clean content with no escaping issues. Only fall back to MySQL if WP-CLI is unavailable.
5. **WordPress adds `-1` to duplicate filenames** — Upload images exactly ONCE. Check what exists first.
6. **Block theme nav menus are posts** — Not classic menus. Managed via Site Editor → Navigation.
7. **REST API plugin endpoints don't work with encoded slashes** — Use WP Admin bulk actions UI instead for plugin management.
8. **Always sync content THEN images** — Not the other way around. Content determines which images are needed.
9. **MX records** — Don't touch MX records during migration unless email is also moving. Breaking email is worse than breaking the site.
10. **Fresh backup before AND after** — Take backups of both source and destination before starting. Take another backup of live after successful migration.
