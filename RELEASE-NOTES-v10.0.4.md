# Brownstone Careers v10.0.4

## Workforce dashboard runtime hardening

- Fixed `Cannot set properties of null (setting 'disabled')` in the Autopilot run control by retaining the button reference across asynchronous work.
- Added null-safe guards to invitation, pre-screening, notification, drawer, and AI-grading controls.
- Prevented optional client-side control errors from incorrectly presenting as a server connection failure.
- Added cache-busting versions to Workforce Administration CSS and JavaScript assets.
- Added automated audits for the runtime regression.
- No database migration is required for this hotfix.
