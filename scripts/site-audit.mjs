import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";

const root = resolve("public");
const htmlNames = (await readdir(root)).filter((name) => name.endsWith(".html"));
const errors = [];
const pages = new Map();

function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([:\w-]+)(?:\s*=\s*["']([^"']*)["'])?/g)].slice(1).map((m) => [m[1].toLowerCase(), m[2] ?? ""]));
}
function stripQuery(value){ return value.split(/[?#]/)[0]; }
function cleanRoute(value){
  const path=stripQuery(value);
  if(path === "/" || path === "") return "index.html";
  return `${path.replace(/^\//, "").replace(/\/$/, "")}.html`;
}
async function exists(path){ try { return (await stat(path)).isFile(); } catch { return false; } }

for (const name of htmlNames) {
  const source = await readFile(resolve(root, name), "utf8");
  const ids = [...source.matchAll(/\bid=["']([^"']+)["']/gi)].map((m) => m[1]);
  pages.set(name, { source, ids: new Set(ids) });
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length) errors.push(`${name}: duplicate id(s): ${[...new Set(duplicates)].join(", ")}`);
  if ((source.match(/<h1\b/gi) || []).length !== 1) errors.push(`${name}: expected exactly one h1`);
  if (!/<main\b[^>]*\bid=["']main-content["']/i.test(source)) errors.push(`${name}: missing main landmark`);
  if (!/<header\b/i.test(source) || !/<footer\b/i.test(source)) errors.push(`${name}: missing shared header or footer`);
  if ((source.match(/<header\b[^>]*class=["'][^"']*\bagency-header\b[^"']*["']/gi) || []).length !== 1) errors.push(`${name}: expected one agency header`);
  if ((source.match(/<footer\b[^>]*class=["'][^"']*\bagency-footer\b[^"']*["']/gi) || []).length !== 1) errors.push(`${name}: expected one agency footer`);
  if (!/href=["']agency-shell\.css["']/i.test(source)) errors.push(`${name}: missing agency shell stylesheet`);
  if (!/data-menu-toggle/i.test(source) || !/data-mobile-drawer/i.test(source) || !/data-drawer-backdrop/i.test(source)) errors.push(`${name}: incomplete responsive navigation controls`);
  if (/executive-header|brand-panel|premium-footer executive-footer/i.test(source)) errors.push(`${name}: legacy header/footer markup remains`);
  if (/<nav\b[^>]*class=["'][^"']*\bagency-nav\b[\s\S]*?<a\b[^>]*data-nav=["']index["'][^>]*>\s*Home\s*<\/a>/i.test(source)) errors.push(`${name}: Home link must not appear in the primary navigation`);
  if (/<nav\b[^>]*class=["'][^"']*\bagency-mobile-links\b[\s\S]*?<a\b[^>]*data-nav=["']index["'][^>]*>\s*Home\s*<\/a>/i.test(source)) errors.push(`${name}: Home link must not appear in the mobile navigation`);
  if (!/agency-brand-emblem[\s\S]{0,300}brand-logo-icon-white\.png/i.test(source) || !/agency-footer-emblem[\s\S]{0,300}brand-logo-icon-white\.png/i.test(source)) errors.push(`${name}: heritage lamp logo is not preserved in header and footer`);
  if (/\+1\s*\(?534\)?|228[\s-]*0244|https:\/\/wa\.me\//i.test(source)) errors.push(`${name}: WhatsApp number or direct wa.me URL is exposed in page source`);
  for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (!("alt" in a)) errors.push(`${name}: image missing alt attribute`);
    if (a.src && !/^(?:https?:|data:)/i.test(a.src) && !(await exists(resolve(root, stripQuery(a.src).replace(/^\//, ""))))) errors.push(`${name}: missing image ${a.src}`);
  }
  for (const match of source.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const a=attrs(match[0]); const ref=a.src || (a.rel?.includes("stylesheet") ? a.href : "");
    if(ref && !/^(?:https?:|data:)/i.test(ref) && !(await exists(resolve(root, stripQuery(ref).replace(/^\//, ""))))) errors.push(`${name}: missing asset ${ref}`);
  }
  for (const block of source.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(block[1]); } catch (error) { errors.push(`${name}: invalid JSON-LD (${error.message})`); }
  }
  for (const form of source.matchAll(/<form\b[\s\S]*?<\/form>/gi)) {
    const formSource=form[0];
    if (!/\baction=["']\/api\//i.test(formSource)) errors.push(`${name}: form does not use an approved API action`);
    if (!/class=["'][^"']*form-status/i.test(formSource)) errors.push(`${name}: form missing accessible status region`);
  }
}

try {
  const manifest = JSON.parse(await readFile(resolve(root, "site.webmanifest"), "utf8"));
  if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) errors.push("site.webmanifest: expected 192px and 512px icons");
  for (const icon of manifest.icons || []) {
    if (!icon?.src || !(await exists(resolve(root, stripQuery(icon.src).replace(/^\//, ""))))) errors.push(`site.webmanifest: missing icon ${icon?.src || "(empty)"}`);
  }
} catch (error) {
  errors.push(`site.webmanifest: invalid JSON (${error.message})`);
}

for (const [name, { source }] of pages) {
  for (const link of source.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const href=link[1];
    if (/^(?:https?:|mailto:|tel:|javascript:)/i.test(href) || href === "/whatsapp") continue;
    const [pathPart, fragment] = href.split("#");
    const targetName = pathPart ? cleanRoute(pathPart) : name;
    const target = pages.get(targetName);
    if (!target) { errors.push(`${name}: broken internal link ${href}`); continue; }
    if (fragment && !target.ids.has(fragment)) errors.push(`${name}: missing fragment target ${href}`);
  }
}

if (errors.length) {
  console.error("Site audit failed:\n" + errors.map((e) => `- ${e}`).join("\n"));
  process.exit(1);
}
console.log(`Site audit passed for ${htmlNames.length} pages.`);
