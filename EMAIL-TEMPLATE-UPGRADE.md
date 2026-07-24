# Official Brownstone Careers Resend Email System

The `/emails/` directory is the single source of truth for candidate-facing and internal website email design.

## Official templates

- Application received
- Contact received
- Internal candidate application notification
- Internal website support notification
- Pre-screening invitation
- Pre-screening result
- Interview invitation
- Offer letter
- General recruitment update

## Shared standard

Every template now includes:

- Official hosted Brownstone Careers horizontal logo
- Navy branded header and blue corporate palette
- Accessible preheader and logo alternative text
- Mobile-responsive, table-based email markup
- Consistent status badges, detail cards, CTA buttons, typography, and spacing
- Official agency footer, website link, support address, and candidate-safety notice
- Escaping of candidate-provided content before rendering

Both Cloudflare Pages Functions and the optional Express server use this design system. Do not create separate inline email layouts in API handlers.

## Production sender

Use the verified Resend subdomain sender:

```text
Brownstone Careers <notifications@mail.brownstonecareers.agency>
```

Set `EMAIL_REPLY_TO` to the real monitored support inbox. See `RESEND-SUBDOMAIN-SETUP.md` for DNS and deployment instructions.
