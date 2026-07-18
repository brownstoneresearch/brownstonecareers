const host = "brownstonecareers.agency";
const key = "034daaf5f852e6791e5269922b8ae775";
const urls = [
  "https://brownstonecareers.agency/",
  "https://brownstonecareers.agency/about.html",
  "https://brownstonecareers.agency/roles.html",
  "https://brownstonecareers.agency/process.html",
  "https://brownstonecareers.agency/faq.html",
  "https://brownstonecareers.agency/contact.html",
  "https://brownstonecareers.agency/apply.html"
];

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls })
});

if (!response.ok) {
  throw new Error(`IndexNow submission failed: ${response.status} ${await response.text()}`);
}
console.log(`IndexNow accepted ${urls.length} URLs with HTTP ${response.status}.`);
