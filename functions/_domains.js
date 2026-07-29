const DEFAULT_PUBLIC_URL = "https://brownstonecareers.agency";
const DEFAULT_ONBOARDING_URL = "https://onboarding.brownstonecareers.agency";
const DEFAULT_WORKFORCE_URL = "https://workforce.brownstonecareers.agency";
const DEFAULT_MAIL_HOST = "mail.brownstonecareers.agency";

function normalizeBaseUrl(value, fallback) {
  const candidate = String(value || "").trim() || fallback;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol)) return fallback;
    url.pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

export function publicSiteUrl(env) {
  return normalizeBaseUrl(env?.PUBLIC_SITE_URL, DEFAULT_PUBLIC_URL);
}

export function onboardingPortalUrl(env) {
  return normalizeBaseUrl(env?.ONBOARDING_PORTAL_URL, DEFAULT_ONBOARDING_URL);
}

export function workforceAdminUrl(env) {
  return normalizeBaseUrl(env?.WORKFORCE_ADMIN_URL, DEFAULT_WORKFORCE_URL);
}

export function configuredHosts(env) {
  return {
    public: new URL(publicSiteUrl(env)).hostname.toLowerCase(),
    onboarding: new URL(onboardingPortalUrl(env)).hostname.toLowerCase(),
    workforce: new URL(workforceAdminUrl(env)).hostname.toLowerCase(),
    mail: String(env?.MAIL_SENDING_HOST || DEFAULT_MAIL_HOST).trim().toLowerCase(),
  };
}

export function requestHost(request) {
  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isDevelopmentHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".pages.dev");
}

export function isOnboardingRequest(request, env) {
  const host = requestHost(request);
  return host === configuredHosts(env).onboarding || isDevelopmentHost(host);
}

export function isWorkforceRequest(request, env) {
  const host = requestHost(request);
  return host === configuredHosts(env).workforce || isDevelopmentHost(host);
}

export function serviceRedirect(request, baseUrl, path = "/", status = 302) {
  const incoming = new URL(request.url);
  const target = new URL(baseUrl);
  target.pathname = path.startsWith("/") ? path : `/${path}`;
  target.search = incoming.search;
  return Response.redirect(target.toString(), status);
}

export function productionUrls(env) {
  return {
    publicSite: publicSiteUrl(env),
    onboardingPortal: onboardingPortalUrl(env),
    workforceAdmin: workforceAdminUrl(env),
    mailHost: configuredHosts(env).mail,
  };
}
