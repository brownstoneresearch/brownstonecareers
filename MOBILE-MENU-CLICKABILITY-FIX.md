# Mobile Menu Clickability Fix

The drawer links now remain interactive until the browser completes navigation.

## Corrections
- Removed synchronous drawer closure that applied `inert` during a link click.
- Normal navigation links are allowed to complete without JavaScript interference.
- Same-document, external-app, and new-tab links close on the next event-loop turn.
- Added explicit pointer and touch behavior for drawer links and controls.
- Removed the page-wide `touch-action:none` state that could interfere with mobile taps.
- Preserved focus trapping, Escape closing, backdrop closing, scroll locking, and accessibility states.
