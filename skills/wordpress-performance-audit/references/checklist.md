# WordPress performance review checklist

## PHP and request work

- Repeated expensive work in template loops, hooks, filters, shortcodes, or block callbacks
- Remote HTTP, filesystem scans, image processing, or JSON parsing during frontend requests
- Autoloaded options or large option payloads accessed unnecessarily
- Missing memoization or transient/object-cache use for expensive stable results
- Hooks registered globally when behavior is page-, admin-, REST-, or template-specific

## Database access

- `WP_Query`, `get_posts`, direct `$wpdb`, taxonomy, user, comment, or metadata queries inside loops
- Unbounded result sets, avoidable counts, missing `no_found_rows`, or unnecessary object/meta/term cache priming
- Repeated `get_post_meta`, term, option, or relationship lookups that could be bulk-loaded or cached
- Queries executed merely to check existence when a cheaper API or cached value is available

## Assets and rendering

- Site-wide enqueueing for page-specific scripts or styles
- Duplicate libraries, render-blocking scripts, missing footer/defer strategy, or unused dependencies
- Development source and compiled bundles both shipped
- Oversized bundles, source maps, unused variants, or assets duplicated across directories
- Inline data or markup repeated excessively

## Images and fonts

- Full-size images where WordPress image sizes should be used
- Missing width/height, responsive `srcset` support, lazy loading below the fold, or priority for the actual LCP candidate
- Too many font files/weights, blocking external font requests, or absent preload only where justified
- Theme code that defeats WordPress responsive image generation

## Runtime-only follow-up

Recommend profiling when evidence depends on database size, plugin interactions, cache configuration, hosting, traffic, or rendered-page behavior. Useful follow-ups include Query Monitor, server timing/APM, browser coverage, Lighthouse/WebPageTest, and real-user Core Web Vitals.
