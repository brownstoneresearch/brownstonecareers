# Search-engine setup for Brownstone Careers

The project now includes crawlable metadata, canonical URLs, Open Graph and X cards, JSON-LD structured data, `robots.txt`, `sitemap.xml`, `llms.txt`, and IndexNow support.

## 1. Deploy the updated project

```powershell
npm ci
npm test
npx wrangler pages deploy .\public --project-name brownstone-careers --branch main
```

## 2. Bing Webmaster Tools

1. Add `https://brownstonecareers.agency` in Bing Webmaster Tools.
2. Verify ownership by DNS, HTML file, meta tag, or import from Google Search Console.
3. Submit `https://brownstonecareers.agency/sitemap.xml`.
4. Inspect the homepage and important pages after deployment.

## 3. IndexNow

After the updated site is live, notify Bing and other participating engines:

```powershell
npm run indexnow
```

The verification file is already included at `/034daaf5f852e6791e5269922b8ae775.txt`. Run the command after publishing significant page changes.

## 4. Brave Search

Brave operates an independent crawler and does not currently provide a conventional webmaster submission dashboard. Keep the site crawlable, retain the sitemap and internal links, and obtain legitimate external links so Brave can discover the domain.

## 5. Google and other engines

Add the domain to Google Search Console and submit the same sitemap. Yandex and other engines that offer webmaster portals can also use the root sitemap. Do not add verification meta tags until the engine provides the exact token.

## Validation URLs

- `https://brownstonecareers.agency/robots.txt`
- `https://brownstonecareers.agency/sitemap.xml`
- `https://brownstonecareers.agency/llms.txt`
- `https://brownstonecareers.agency/034daaf5f852e6791e5269922b8ae775.txt`
