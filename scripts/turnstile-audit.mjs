import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contact = await readFile(new URL("../public/contact.html", import.meta.url), "utf8");
const shared = await readFile(new URL("../functions/_shared.js", import.meta.url), "utf8");
const browser = await readFile(new URL("../public/script.js", import.meta.url), "utf8");
const envExample = await readFile(new URL("../.dev.vars.example", import.meta.url), "utf8");

assert.match(contact, /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
assert.match(contact, /class="cf-turnstile"[^>]*data-action="turnstile-spin-v2"[^>]*data-sitekey="0x4AAAAAAD4dZ6uvgEldqskh"/);
assert.match(shared, /TURNSTILE_SECRET/);
assert.doesNotMatch(shared, /TURNSTILE_SECRET_KEY/);
assert.match(shared, /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
assert.match(shared, /result\.success !== true/);
assert.match(shared, /result\.action === TURNSTILE_ACTION/);
assert.match(shared, /resultHostname === requestHostname/);
assert.match(browser, /turnstile\.reset/);
assert.match(envExample, /^TURNSTILE_SECRET=/m);
assert.doesNotMatch(envExample, /TURNSTILE_SECRET_KEY/);

console.log("Canonical Turnstile widget, secret binding, Siteverify gate, action/hostname checks, and retry reset audit passed.");
