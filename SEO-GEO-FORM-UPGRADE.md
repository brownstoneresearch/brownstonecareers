# Brownstone Careers SEO/GEO and Premium Form Upgrade

## Fixed technical issues

- Rewrote every page title and meta description with unique search intent and consistent brand naming.
- Kept all meta descriptions between 120 and 160 characters.
- Added descriptive, non-empty `alt` text to every image, including the eight footer platform logos flagged by automated audits.
- Added Twitter Card metadata alongside Open Graph metadata.
- Added complete Open Graph image dimensions, MIME type, secure URL, and image alternative text.
- Replaced generic JSON-LD with page-specific `@graph` structured data.
- Added Organization, WebSite, WebPage, AboutPage, ContactPage, CollectionPage, BreadcrumbList, Service, ItemList, FAQPage, and HowTo entities where appropriate.
- Added clean canonical URLs and redirects from `.html` URLs.
- Updated every internal link and the XML sitemap to use the same canonical URL format.
- Added image entries to the sitemap.
- Explicitly allowed Googlebot, Bingbot, DuckDuckBot, Applebot, PerplexityBot, and standards-compliant crawlers.
- Preserved IndexNow support.
- Added a visible home-page authority section that clearly explains the organization, audience, services, and core candidate resources.
- Added an automated SEO regression audit to `npm test`.

## Premium form redesign

- Rebuilt the application form into four clearly labeled sections.
- Rebuilt the contact form into three clearly labeled sections.
- Added refined field labels, placeholders, help text, premium file upload treatment, consent styling, secure verification panels, and submission panels.
- Restyled the application sidebar, readiness card, contact information panel, and security notices.
- Added responsive layouts for desktop, tablet, and mobile.
- Kept every original field name, form action, Turnstile integration, Pages Function endpoint, and Resend workflow intact.

## Important ranking note

No developer, agency, or technical change can guarantee the first organic result on Google, Bing, Brave, DuckDuckGo, Apple Search, or AI search products. Rankings depend on indexing, content quality, authority, competition, user behavior, links, brand recognition, and time. This build removes the identified technical barriers and creates a stronger foundation for ranking.

## After deployment

1. Verify the production URL and canonical host are working.
2. Submit `https://www.brownstonecareers.agency/sitemap.xml` to Google Search Console and Bing Webmaster Tools.
3. Inspect each canonical page in Google Search Console and request indexing.
4. Run `npm run indexnow` after the deployment.
5. Validate the home page, FAQ page, process page, and roles page with Schema Markup Validator and Google Rich Results Test.
6. Continue publishing original, useful role and candidate guidance content and build legitimate brand mentions and links.
