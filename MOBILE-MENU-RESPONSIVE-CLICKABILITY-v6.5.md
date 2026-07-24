# Brownstone Careers Mobile Menu v6.5

The mobile drawer was audited and updated across all eight public pages.

## Verified options

- About → `/about`
- Roles → `/roles`
- Process → `/process`
- FAQ → `/faq`
- Contact → `/contact`
- Candidate support → `/contact#candidate-support`
- Apply now → `/apply`

## Reliability updates

- Added a dedicated Candidate Support option and destination anchor.
- Renamed the mobile application CTA to “Apply now.”
- Preserved native navigation so taps are not cancelled by an early `inert` state.
- Added safe closing for current-page and same-document links.
- Maintained minimum 50–52 px touch targets on mobile.
- Confirmed the drawer remains outside the sticky header and above the backdrop.
- Added a permanent automated mobile-menu audit to `npm run check`.
- Verified all public routes and the production build.
