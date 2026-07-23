# Brownstone Careers Mobile Menu Fix — v6.2

- Corrected the stacking-context conflict that placed the backdrop above the mobile dropdown.
- Kept the drawer above the backdrop and page content on every mobile viewport.
- Added viewport-aware height limits and internal scrolling for short screens.
- Added `inert` and ARIA state management so hidden menu controls cannot receive focus.
- Improved Escape, backdrop, close-button, link-click, resize, and focus-return behavior.
- Added visible keyboard focus treatments and reduced-motion compatibility.
