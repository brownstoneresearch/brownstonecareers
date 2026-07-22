import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const publicDir = resolve("public");
const htmlFiles = (await readdir(publicDir)).filter((name) => name.endsWith(".html"));
const errors = [];

for (const name of htmlFiles) {
  const source = await readFile(resolve(publicDir, name), "utf8");
  const description = source.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || source.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const title = source.match(/<title>([\s\S]*?)<\/title>/i);
  const canonical = source.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    || source.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  const images = [...source.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const missingAlt = images.filter((tag) => !/\balt=["'][^"']+["']/i.test(tag));
  const htmlLinks = [...source.matchAll(/href=["']([^"']+\.html(?:[?#][^"']*)?)["']/gi)].map((match) => match[1]);
  const jsonLdBlocks = [...source.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  if (!description) errors.push(`${name}: missing meta description`);
  else if (description[1].length < 120 || description[1].length > 160) {
    errors.push(`${name}: meta description length is ${description[1].length}; expected 120-160`);
  }
  if (!title) errors.push(`${name}: missing title`);
  else {
    const cleanTitle = title[1].replace(/&amp;/g, "&").trim();
    if (cleanTitle.length < 30 || cleanTitle.length > 60) {
      errors.push(`${name}: title length is ${cleanTitle.length}; expected 30-60`);
    }
  }
  if (!canonical) errors.push(`${name}: missing canonical URL`);
  if (!/property=["']og:title["']/i.test(source)) errors.push(`${name}: missing Open Graph title`);
  if (!/name=["']twitter:card["']/i.test(source)) errors.push(`${name}: missing Twitter Card`);
  if (missingAlt.length) errors.push(`${name}: ${missingAlt.length} image(s) have missing or empty alt text`);
  if (htmlLinks.length) errors.push(`${name}: found non-canonical .html links: ${htmlLinks.join(", ")}`);
  if (!jsonLdBlocks.length) errors.push(`${name}: missing JSON-LD`);
  for (const [, payload] of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(payload);
      if (!parsed["@graph"] || parsed["@graph"].length < 3) {
        errors.push(`${name}: JSON-LD graph should contain at least 3 entities`);
      }
    } catch (error) {
      errors.push(`${name}: invalid JSON-LD (${error.message})`);
    }
  }
}

if (errors.length) {
  console.error("SEO audit failed:\n" + errors.map((e) => `- ${e}`).join("\n"));
  process.exit(1);
}

console.log(`SEO audit passed for ${htmlFiles.length} HTML pages.`);
