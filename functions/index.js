import {
  configuredHosts,
  onboardingPortalUrl,
  publicSiteUrl,
  requestHost,
  serviceRedirect,
  workforceAdminUrl,
} from "./_domains.js";

const PUBLIC_HEADERS = {
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "x-permitted-cross-domain-policies": "none",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

export async function onRequest(context) {
  const host = requestHost(context.request);
  const hosts = configuredHosts(context.env);

  if (host === hosts.onboarding) {
    return serviceRedirect(context.request, onboardingPortalUrl(context.env), "/onboarding_portal/", 302);
  }
  if (host === hosts.workforce) {
    return serviceRedirect(context.request, workforceAdminUrl(context.env), "/workforce_admin/", 302);
  }
  if (host === hosts.mail) {
    return serviceRedirect(context.request, publicSiteUrl(context.env), "/", 302);
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(PUBLIC_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
