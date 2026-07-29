import { isOnboardingRequest, onboardingPortalUrl, serviceRedirect } from "../_domains.js";
import { protectRequest } from "../_portal-auth.js";

export function onRequest(context) {
  if (!isOnboardingRequest(context.request, context.env)) {
    return serviceRedirect(
      context.request,
      onboardingPortalUrl(context.env),
      new URL(context.request.url).pathname,
      context.request.method === "GET" || context.request.method === "HEAD" ? 302 : 307,
    );
  }
  return protectRequest(context);
}
