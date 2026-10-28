---
name: wordpress-blocks
description: Generate valid WordPress block markup for pages, posts, and templates. Produces block editor-compatible HTML that passes validation — covers Cover blocks, Query Loops, navigation menus, template parts, and theme.json design tokens. Use when building or updating WordPress pages programmatically via WP-CLI or the REST API.
user-invocable: true
disable-model-invocation: false
argument-hint: '[page-description] [--type page|post|template|pattern] [--style design-system-name]'
allowed-tools: Read, Glob, Grep, Bash, AskUserQuestion, Write
---

# WordPress Block Builder

Generate valid WordPress Gutenberg block markup that passes editor validation on the first try. Covers page creation, post styling, template parts, Query Loops, Cover blocks, and design token integration — all deployable via WP-CLI.

## Invocation

```bash
# Generate a page with block content
/wordpress-blocks "Create a photography portfolio page with masonry grid"

# Generate a blog listing page with category filters
/wordpress-blocks "Blog page with 3-column card grid and category filter bar" --type page

# Generate a custom header template part
/wordpress-blocks "Site header with logo, nav menu, and CTA button" --type template

# Generate a block pattern
/wordpress-blocks "Work showcase card with image, client name, metric" --type pattern
```

## When to Activate

- User asks to create or update a WordPress page programmatically
- User needs block markup that works in the Gutenberg editor without "invalid content" errors
- User is building pages via WP-CLI (`wp post create/update`)
- User wants Query Loop, Cover block, or template part markup
- User mentions WordPress blocks, patterns, or theme.json

## Core Principle

**WordPress block markup is a serialization format, not HTML.** Every block is wrapped in HTML comments (`<!-- wp:blockname {...} -->`) containing a JSON object of attributes. The HTML between comments must match *exactly* what WordPress would generate — wrong classes, missing attributes, or extra whitespace causes block validation failures.

## Block Markup Syntax

### Basic Structure

```html
<!-- wp:group {"className":"my-class","layout":{"type":"constrained","contentSize":"700px"}} -->
<div class="wp-block-group my-class">
  <!-- wp:paragraph -->
  <p>Content here</p>
  <!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
```

**Rules:**
- The JSON in the comment must match the HTML attributes below it
- Self-closing blocks use `<!-- wp:block-name {...} /-->`
- Never place non-block HTML comments between blocks (causes parser errors)
- Only `<!-- wp:name -->` and `<!-- /wp:name -->` comments are allowed inside block content

### Attribute-to-HTML Mapping

When block JSON specifies style attributes, the HTML element must include corresponding utility classes:

| JSON Attribute | Required HTML Class |
|---|---|
| `"style":{"color":{"text":"#hex"}}` | `class="has-text-color"` + `style="color:#hex"` |
| `"style":{"color":{"background":"#hex"}}` | `class="has-background"` + `style="background-color:#hex"` |
| `"textColor":"preset-slug"` | `class="has-preset-slug-color has-text-color"` |
| `"backgroundColor":"preset-slug"` | `class="has-preset-slug-background-color has-background"` |
| `"align":"full"` | `class="alignfull"` |
| `"align":"wide"` | `class="alignwide"` |
| `"textAlign":"center"` | `class="has-text-align-center"` |

**Critical:** If JSON says `{"style":{"color":{"text":"#54505B"}}}`, the HTML MUST include `class="has-text-color"`:

```html
<!-- wp:paragraph {"style":{"color":{"text":"#54505B"}}} -->
<p class="has-text-color" style="color:#54505B">Text here</p>
<!-- /wp:paragraph -->
```

Without `has-text-color`, the block editor shows "Block contains unexpected or invalid content."

## Block Reference

### Cover Block (with background image)

The most error-prone block. The image must be a plain `<img>` tag — NOT an inner `<!-- wp:image -->` block.

```html
<!-- wp:cover {"url":"http://example.com/photo.jpg","id":123,"dimRatio":40,"minHeight":380,"minHeightUnit":"px","isDark":true,"className":"custom-class","style":{"border":{"radius":"8px"}}} -->
<div class="wp-block-cover is-dark custom-class" style="border-radius:8px;min-height:380px">
  <span aria-hidden="true" class="wp-block-cover__background has-background-dim-40 has-background-dim"></span>
  <img class="wp-block-cover__image-background wp-image-123" alt="Description" src="http://example.com/photo.jpg" data-object-fit="cover"/>
  <div class="wp-block-cover__inner-container">
    <!-- inner blocks go here -->
  </div>
</div>
<!-- /wp:cover -->
```

**Cover block rules:**
- `url` and `id` go in the block comment JSON, not as an inner Image block
- Image uses `class="wp-block-cover__image-background wp-image-{id}"`
- Add `data-object-fit="cover"` attribute on the img
- `isDark: true` → class `is-dark`; `isDark: false` → class `is-light`
- `dimRatio` maps to `has-background-dim-{value}` on the span
- Inner content headings inherit white text from `is-dark` — don't set explicit text color on them (avoids `has-text-color` validation issues)

### Query Loop (Blog Card Grid)

```html
<!-- wp:query {"queryId":1,"query":{"perPage":12,"postType":"post","order":"desc","orderBy":"date","inherit":false},"layout":{"type":"constrained","contentSize":"1200px"}} -->
<div class="wp-block-query">
  <!-- wp:post-template {"layout":{"type":"grid","columnCount":3},"className":"custom-cards"} -->
    <!-- wp:group {"layout":{"type":"default"}} -->
    <div class="wp-block-group">
      <!-- wp:post-featured-image {"isLink":true,"aspectRatio":"16/9"} /-->
      <!-- wp:group {"style":{"spacing":{"padding":{"top":"24px","right":"24px","bottom":"24px","left":"24px"}}}} -->
      <div class="wp-block-group" style="padding-top:24px;padding-right:24px;padding-bottom:24px;padding-left:24px">
        <!-- wp:post-terms {"term":"category"} /-->
        <!-- wp:post-date /-->
        <!-- wp:post-title {"level":3,"isLink":true} /-->
        <!-- wp:post-excerpt {"excerptLength":20} /-->
      </div>
      <!-- /wp:group -->
    </div>
    <!-- /wp:group -->
  <!-- /wp:post-template -->

  <!-- wp:query-pagination {"layout":{"type":"flex","justifyContent":"center"}} -->
    <!-- wp:query-pagination-previous /-->
    <!-- wp:query-pagination-numbers /-->
    <!-- wp:query-pagination-next /-->
  <!-- /wp:query-pagination -->

  <!-- wp:query-no-results -->
    <!-- wp:paragraph {"align":"center"} -->
    <p class="has-text-align-center">No posts found.</p>
    <!-- /wp:paragraph -->
  <!-- /wp:query-no-results -->
</div>
<!-- /wp:query -->
```

**Query Loop rules:**
- `"inherit": true` → uses the main WordPress query (for archive/category templates)
- `"inherit": false` → uses its own query (for standalone pages like /blog/)
- WordPress ignores page content when a page is set as `page_for_posts` — use a regular page with `inherit: false` instead
- Dynamic blocks (`post-featured-image`, `post-title`, `post-date`, `post-terms`, `post-excerpt`) are self-closing

### Navigation Menu

First create a `wp_navigation` post, then reference it in template parts:

```bash
# Create menu
wp post create --post_type=wp_navigation --post_title="Main Menu" --post_status=publish \
  --post_content='<!-- wp:navigation-link {"label":"Blog","url":"/blog/","kind":"custom","isTopLevelLink":true} /-->
<!-- wp:navigation-link {"label":"About","url":"/about/","kind":"custom","isTopLevelLink":true} /-->
<!-- wp:navigation-link {"label":"Contact","url":"https://linkedin.com/in/user","opensInNewTab":true} /-->'
```

Then reference by ID in templates:
```html
<!-- wp:navigation {"ref":835,"overlayBackgroundColor":"base","overlayTextColor":"contrast","layout":{"type":"flex","justifyContent":"right"}} /-->
```

**Navigation rules:**
- `"opensInNewTab": true` makes links open in new tab
- Without `"ref"`, WordPress auto-generates a menu from all pages (usually not desired)
- Footer navigation: use `"overlayMenu":"never"` and `"orientation":"vertical"` for stacked links

### Template Parts (Header/Footer)

WordPress block themes load template parts from `wp_template_part` posts. To override the theme's default:

```bash
# Create custom header
wp post create --post_type=wp_template_part --post_title="Header" --post_name="header" \
  --post_status=publish --post_content="$(cat header.html)"

# Associate with theme and set area
wp post term set {ID} wp_theme twentytwentyfive
wp post meta update {ID} wp_theme_part_area header
```

Template structure must include header/footer references:
```html
<!-- wp:template-part {"slug":"header"} /-->

<!-- wp:group {"tagName":"main"} -->
<main class="wp-block-group">
  <!-- page content -->
</main>
<!-- /wp:group -->

<!-- wp:template-part {"slug":"footer"} /-->
```

### List Block

```html
<!-- wp:list {"className":"custom-list"} -->
<ul class="custom-list"><li>Item one</li><li>Item two</li><li>Item three</li></ul>
<!-- /wp:list -->
```

**List rules:**
- Keep `<ul>` and `<li>` on a single line with no extra whitespace between them
- Indented `<li>` with line breaks causes validation mismatches

## Layout & Width

### Breaking Out of Theme Content Width

Block themes (like TT5) constrain content to `contentSize` (often 700px). To use full width:

```html
<!-- wp:group {"align":"full","layout":{"type":"constrained","contentSize":"1200px"},"style":{"spacing":{"padding":{"left":"48px","right":"48px"}}}} -->
<div class="wp-block-group alignfull" style="padding-left:48px;padding-right:48px">
  <!-- content at 1200px max-width -->
</div>
<!-- /wp:group -->
```

**Key:** `"align":"full"` + class `alignfull` breaks out of the theme constraint. Side padding prevents edge-to-edge content on small screens. Inner blocks can then use their own `contentSize` (e.g., 700px for article text, 1200px for grids).

### Constrained vs Default Layout

- `"layout":{"type":"constrained","contentSize":"700px"}` → centers content with max-width, children inherit
- `"layout":{"type":"default"}` → no width constraint, fills parent
- `"layout":{"type":"flex","justifyContent":"space-between"}` → flexbox row

## WP-CLI Deployment

### Create a page from an HTML file

```bash
# Create
wp post create --post_type=page --post_title="Page Title" --post_name="slug" \
  --post_status=publish --post_content="$(cat page-content.html)"

# Update
wp post update {ID} --post_content="$(cat page-content.html)"

# Set as homepage
wp option update show_on_front page
wp option update page_on_front {ID}
```

### Media import in Docker

```bash
# MUST use -u 33:33 (www-data) for file permissions
docker compose run --rm -u 33:33 wpcli media import /path/to/file.jpg --title="Image Title"
```

Without `-u 33:33`, media import fails with "The uploaded file could not be moved."

### Verify block validity

After creating/updating a page, open the editor to check:
```bash
# Check for validation errors in browser console
# "Block validation: Block validation failed" = broken markup
# "Block successfully updated" = valid
```

## Anti-Patterns

### Things that break block validation

1. **Using `<!-- wp:image -->` inside Cover blocks** — use plain `<img>` with `wp-block-cover__image-background` class
2. **Missing `has-text-color` class** when using inline `style.color.text`
3. **HTML comments between blocks** — `<!-- section divider -->` between closing `</div>` and next `<!-- wp:block -->` confuses the parser
4. **Extra whitespace in list markup** — indented `<li>` elements cause validation mismatch
5. **Setting explicit text color inside dark Cover blocks** — let `is-dark` handle inheritance; explicit colors require `has-text-color` class

### Things that look right but break layout

1. **Content stuck at 700px** — outer Group needs `"align":"full"` to escape theme's `contentSize`
2. **Lists with huge left margin** — theme's constrained layout auto-centers list blocks; fix with `max-width: 700px; margin-left: auto; margin-right: auto; box-sizing: border-box;`
3. **Featured images cropping** — TT5 single template uses `"aspectRatio":"3/2"` on `post-featured-image`; create custom single template without it
4. **Page title showing above hero** — hide with `h1.wp-block-post-title { display: none; }` and provide your own heading
5. **Duplicate header/footer** — when page content includes navigation blocks AND the theme template has them; use `body:has(.custom-hero) header.wp-block-template-part { display: none; }`

## SEO Meta via PHP (No Plugin)

Add to a plugin's PHP:

```php
function output_seo_meta() {
    if ( is_singular() ) {
        $post  = get_queried_object();
        $title = get_the_title( $post ) . ' — Site Name';
        $desc  = wp_strip_all_tags( $post->post_excerpt ?: substr( $post->post_content, 0, 160 ) );
        $url   = get_permalink( $post );
        $image = get_the_post_thumbnail_url( $post, 'large' );
    } elseif ( is_category() ) {
        $term  = get_queried_object();
        $title = $term->name . ' — Site Name';
        $desc  = $term->description ?: 'Posts about ' . $term->name;
        $url   = get_term_link( $term );
    }
    // Output tags
    echo '<meta name="description" content="' . esc_attr( $desc ) . '" />';
    echo '<meta property="og:title" content="' . esc_attr( $title ) . '" />';
    echo '<meta property="og:description" content="' . esc_attr( $desc ) . '" />';
    echo '<meta property="og:url" content="' . esc_url( $url ) . '" />';
    echo '<meta property="og:image" content="' . esc_url( $image ) . '" />';
    echo '<meta name="twitter:card" content="summary_large_image" />';
}
add_action( 'wp_head', 'output_seo_meta', 1 );
```

## theme.json Design Tokens

Plugins can inject design tokens via filter:

```php
function inject_theme_json( $theme_json ) {
    $tokens = json_decode( file_get_contents( __DIR__ . '/theme.json' ), true );
    $theme_json->update_with( $tokens );
    return $theme_json;
}
add_filter( 'wp_theme_json_data_theme', 'inject_theme_json' );
```

**theme.json structure:**
```json
{
  "version": 3,
  "settings": {
    "color": { "palette": [...] },
    "typography": { "fontFamilies": [...], "fontSizes": [...] },
    "spacing": { "spacingSizes": [...] },
    "layout": { "contentSize": "700px", "wideSize": "1200px" },
    "shadow": { "presets": [...] }
  }
}
```

Tokens become available in the editor UI (color picker, spacing controls, font selector).

## Output Format

When generating block content:

1. **Write to an HTML file** (e.g., `page-content.html`) — never try to pass multiline block markup directly on the command line
2. **Deploy via WP-CLI**: `wp post create --post_content="$(cat file.html)"`
3. **Verify in the editor** — open the page in wp-admin and check for "invalid content" warnings
4. **Check console** — `Block validation failed` = broken; `Block successfully updated` = valid

## Key Principles

1. **Block markup is a serialization contract** — the JSON attributes and the HTML must agree exactly
2. **Cover blocks are special** — they're the #1 source of validation errors; always use `url`/`id` in JSON + plain `<img>` tag
3. **`has-text-color` is not optional** — if you set `style.color.text` in JSON, add the class
4. **Test in the editor, not just the frontend** — a page can render fine on the frontend but break in the editor
5. **Use `alignfull` to escape theme constraints** — then set your own `contentSize` on the inner Group
6. **`-u 33:33` for Docker media import** — WordPress runs as www-data (uid 33)
7. **No HTML comments between blocks** — only `<!-- wp:name -->` comments are allowed
8. **Lists: single line, no whitespace** — `<ul><li>One</li><li>Two</li></ul>`
9. **`inherit: false` for standalone blog pages** — `inherit: true` only for archive templates
10. **Write block content to files, deploy via WP-CLI** — never construct block markup inline in shell commands
