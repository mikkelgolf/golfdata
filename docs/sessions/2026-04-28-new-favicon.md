# Session: Add new CGD logo as site favicon

- **Date:** 2026-04-28
- **Branch:** `ron/new-favicon`
- **Requester:** David Tenneson (Discord: collegegolfbook)

## Task

Replace the existing `favicon.ico` with the new CGD logo (circuit-
pattern "CGD" mark on dark background) provided via Google Drive.

## Decisions

- **Source asset:** 768×768 PNG with alpha (RGBA), 198 KB. Saved to
  `data/source/logo/cgd-logo-768.png` for future regeneration.
- **Strategy:** use Next.js 15 App Router file-based icon convention.
  Files at `src/app/icon.png` and `src/app/apple-icon.png` are
  auto-served with the right MIME types and `<link>` tags injected;
  no `<head>` changes needed.
- **Sizes shipped:**
  - `src/app/icon.png` — 256×256 (browser favicon; downscaled by the
    browser to 16/32/48 as needed, with plenty of pixels for retina).
  - `src/app/apple-icon.png` — 180×180 (iOS home-screen icon, the
    Apple-recommended size).
- **Legacy `favicon.ico` removed.** Next prefers `icon.png` when both
  exist, and modern browsers all support PNG favicons. The .ico was
  the old logo; leaving it in place created a chance of the wrong
  icon being served somewhere.

## Implementation

- `src/app/icon.png` (256×256, 35 KB) — new
- `src/app/apple-icon.png` (180×180, 20 KB) — new
- `src/app/favicon.ico` — removed (was 26 KB, old logo)
- `data/source/logo/cgd-logo-768.png` — original 768×768 master
  preserved for future regeneration (gitignored under `data/`).

Resizes done with macOS `sips -Z <size>`.

## Verification

- File types confirmed via `file`: both PNGs, RGBA, correct dimensions.
- Visual spot-check of resized icon.png — circuit details and
  bar-chart D remain legible at 256×256.
- Preview deploy planned post-commit so David can confirm the new
  tab/home-screen icon in browser + iOS.

## Progress log

- 2026-04-28: branch + session doc created; logo fetched from Drive,
  resized, old favicon.ico removed.
