import { isWorkforceRequest, serviceRedirect, workforceAdminUrl } from "../_domains.js";
import { protectAdminRequest } from "../_admin-auth.js";

export function onRequest(context) {
  if (!isWorkforceRequest(context.request, context.env)) {
    return serviceRedirect(
      context.request,
      workforceAdminUrl(context.env),
      new URL(context.request.url).pathname,
      context.request.method === "GET" || context.request.method === "HEAD" ? 302 : 307,
    );
  }
  return protectAdminRequest(context);
}
