# Brownstone Careers Email Templates

All Resend HTML must be generated through `emails/index.js` (ES modules) or its synchronized `emails/index.cjs` compatibility copy.

Available templates:

- `applicationReceivedEmail`
- `contactReceivedEmail`
- `internalApplicationEmail`
- `internalContactEmail`
- `preScreeningEmail`
- `preScreeningResultEmail`
- `interviewInviteEmail`
- `offerLetterEmail`
- `recruitmentUpdateEmail`

Every template shares the same verified hosted logo, mobile-responsive layout, CTA design, official footer, support identity, and candidate-safety notice. Candidate-provided values must be passed as plain input; the templates escape them before rendering.

Official logo URL:

```text
https://www.brownstonecareers.agency/assets/brownstone-logo-dark.png
```

Recommended sender:

```text
Brownstone Careers <notifications@mail.brownstonecareers.agency>
```
