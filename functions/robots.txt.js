import { configuredHosts, requestHost } from "./_domains.js";

export async function onRequest(context) {
  const host = requestHost(context.request);
  const hosts = configuredHosts(context.env);
  if (host === hosts.onboarding || host === hosts.workforce || host === hosts.mail) {
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    });
  }
  return context.next();
}
