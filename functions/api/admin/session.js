import { hasResendChannel } from "../../_shared.js";
import { adminPermissions, requireAdmin } from "../../_admin-auth.js";
import { hasWorkforceDb, json } from "../../_workforce-db.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.response) return auth.response;
  return json({
    admin: auth.admin,
    permissions: adminPermissions(auth.admin),
    capabilities: {
      workforceDatabase: hasWorkforceDb(context.env),
      applicationFirstInvites: true,
      adminControlledManualInvites: true,
      rankedPipeline: true,
      stageNotifications: true,
      sequentialJourneyEnforced: true,
      candidateNextDirective: true,
      smartPagination: true,
      prescreenManagement: true,
      aiPrescreenGrading: Boolean(context.env.OPENAI_API_KEY),
      privateDocuments: Boolean(context.env.PRIVATE_DOCUMENTS),
      secureIdentity: Boolean(context.env.PRIVATE_DOCUMENTS && context.env.PII_ENCRYPTION_KEY),
      emailDelivery: Boolean(context.env.EMAIL_FROM && (hasResendChannel(context.env, "workforce") || hasResendChannel(context.env, "candidate_invites") || hasResendChannel(context.env, "onboarding"))),
      emailChannels: {
        recruitment: hasResendChannel(context.env, "recruitment"),
        onboarding: hasResendChannel(context.env, "onboarding"),
        accessCodes: hasResendChannel(context.env, "access_codes"),
        candidateInvites: hasResendChannel(context.env, "candidate_invites"),
        workforce: hasResendChannel(context.env, "workforce"),
      },
      cloudflareAccess: Boolean(context.request.headers.get("Cf-Access-Authenticated-User-Email")),
      aiAssistant: true,
      aiGenerative: Boolean(context.env.OPENAI_API_KEY),
      supabase: Boolean(context.env.SUPABASE_URL && (context.env.SUPABASE_SECRET_KEY || context.env.SUPABASE_SERVICE_ROLE_KEY)),
    },
  });
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}
