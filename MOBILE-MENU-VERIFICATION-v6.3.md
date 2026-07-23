# Brownstone Careers Mobile Menu — Verification & Hardening (v6.3)

## What I checked
The v6.2 drawer implementation (`agency-shell.css` + `public/script.js`) was
already architecturally sound. I traced it end-to-end before changing anything:

- **Stacking order**: `.agency-header` uses `isolation:isolate` with
  `z-index:1100`, which paints the whole header (including the `position:fixed`
  drawer inside it) as one group above the backdrop button (`z-index:1090`,
  a header sibling). Confirmed no ancestor of the drawer has a `transform`,
  `filter`, or `will-change` that would turn it into a containing block and
  clip the fixed-position drawer to the header's box.
- **Markup consistency**: every page (`index`, `about`, `roles`, `process`,
  `faq`, `contact`, `apply`, `privacy`) uses the same `agency-*` header/drawer
  classes — no page is still on the old `.site-header` / `.mobile-drawer` /
  `.executive-header` markup that still lives (unused) in `styles.css` as
  dead weight from earlier redesigns.
- **State management**: open/close guards, `inert` + `aria-hidden` syncing,
  focus trap (Tab/Shift+Tab), Escape-to-close, backdrop click, resize-based
  auto-close above the 940px breakpoint, and `dvh`-based height with a
  `100vh`-fallback for older browsers — all correct.
- **Automated checks**: `node scripts/check.mjs` (syntax + Pages Functions),
  `site-audit.mjs`, and `seo-audit.mjs` all pass.

## What I hardened
Two real edge cases weren't covered before, so I added them:

1. **Back/forward cache (bfcache)**: if a phone browser restored the page
   from bfcache with the drawer mid-open, it could get stuck open and lock
   the page. Added a `pageshow` listener that force-closes the menu when
   `event.persisted` is true.
2. **Orientation change**: added an `orientationchange` listener that closes
   the menu, so rotating the phone while the drawer is open can't leave it
   mis-sized or open at the wrong breakpoint.
3. **Notched/rounded-corner phones**: added `viewport-fit=cover` to every
   page and switched the drawer's right offset and height calc to use
   `env(safe-area-inset-right)` / `env(safe-area-inset-bottom)`, so the close
   button and links never sit under a curved edge or bottom gesture bar in
   landscape.

None of these change layout or behavior on any device that was already
working — they only close gaps on specific real-device edge cases.
