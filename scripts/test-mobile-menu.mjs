import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const publicDir = resolve('public');
const htmlFiles = (await readdir(publicDir)).filter((name) => name.endsWith('.html')).sort();
const expected = [
  ['About', '/about'],
  ['Roles', '/roles'],
  ['Process', '/process'],
  ['FAQ', '/faq'],
  ['Contact', '/contact'],
  ['Candidate support', '/contact#candidate-support'],
  ['Apply now', '/apply']
];

const failures = [];
for (const file of htmlFiles) {
  const html = await readFile(resolve(publicDir, file), 'utf8');
  const drawerMatch = html.match(/<aside class="agency-mobile-drawer"[\s\S]*?<\/aside>/);
  if (!drawerMatch) {
    failures.push(`${file}: missing mobile drawer`);
    continue;
  }
  const drawer = drawerMatch[0];
  const headerEnd = html.indexOf('</header>');
  const drawerStart = html.indexOf('<aside class="agency-mobile-drawer"');
  if (drawerStart < headerEnd) failures.push(`${file}: mobile drawer is nested inside the sticky header`);

  for (const [label, href] of expected) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(`<a[^>]+href="${escapedHref}"[^>]*>\\s*${escapedLabel}(?:\\s*<span[^>]*>↗<\\/span>)?\\s*<\\/a>`, 'i');
    if (!expression.test(drawer)) failures.push(`${file}: missing or incorrect ${label} link (${href})`);
  }

  const drawerLinks = [...drawer.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ href: match[1], text: match[2].replace(/<[^>]+>/g, ' ').replace(/↗/g, '').replace(/\s+/g, ' ').trim() }));
  for (const [label] of expected) {
    const count = drawerLinks.filter((item) => item.text === label).length;
    if (count !== 1) failures.push(`${file}: expected one ${label} option, found ${count}`);
  }
}

const contact = await readFile(resolve(publicDir, 'contact.html'), 'utf8');
if (!/id="candidate-support"/.test(contact)) failures.push('contact.html: missing #candidate-support destination');

const css = await readFile(resolve(publicDir, 'agency-shell.css'), 'utf8');
for (const token of ['.agency-mobile-links a', '.agency-mobile-apply', '.agency-mobile-support-link', 'touch-action:manipulation', 'pointer-events:auto']) {
  if (!css.includes(token)) failures.push(`agency-shell.css: missing mobile interaction rule ${token}`);
}

const script = await readFile(resolve(publicDir, 'script.js'), 'utf8');
for (const token of ["new URL(link.href", 'isSameDocument', 'drawer.inert = !open', "window.setTimeout(() => closeMenu"]) {
  if (!script.includes(token)) failures.push(`script.js: missing drawer navigation safeguard ${token}`);
}

if (failures.length) {
  console.error('Mobile menu audit failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`Mobile menu audit passed for ${htmlFiles.length} pages and all ${expected.length} destinations.`);
