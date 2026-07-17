---
name: wordpress-theme-verification
description: Reusable read-only static checklist for WordPress theme structural verification.
---

# WordPress theme verification

Establish target-directory eligibility first. A usable root `style.css` must have a non-empty `Theme Name`. Classify a theme only from observed evidence: `index.php` supports classic structure, `templates/index.html` supports block structure, and both are hybrid evidence. Treat `functions.php`, assets, languages, patterns, template parts, screenshots, and `theme.json` as optional unless detected structure makes a requirement explicit. Parse present `theme.json` as JSON and report its parser location/error. Keep static verification separate from activation, PHP runtime behavior, visual rendering, browser output, compatibility, and performance.
