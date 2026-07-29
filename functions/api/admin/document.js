import { requireAdmin } from "../../_admin-auth.js";
import { auditEvent, clean, hasWorkforceDb, json } from "../../_workforce-db.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context, "document.view");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env) || !context.env.PRIVATE_DOCUMENTS) return json({ message: "Private document storage is not configured." }, 503);
  const id = clean(new URL(context.request.url).searchParams.get("id"), 80);
  const document = await context.env.WORKFORCE_DB.prepare("SELECT * FROM documents WHERE id = ? LIMIT 1").bind(id).first();
  if (!document) return json({ message: "Document not found." }, 404);
  const object = await context.env.PRIVATE_DOCUMENTS.get(document.storage_key);
  if (!object) return json({ message: "Stored document is unavailable." }, 404);
  await auditEvent(context.env, {
    actorType: "admin", actorId: auth.admin.id, candidateId: document.candidate_id,
    eventType: "document.downloaded", description: `Administrator downloaded ${document.category} document for authorized review.`,
    metadata: { documentId: document.id, category: document.category }, request: context.request,
  });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("content-disposition", `attachment; filename="${String(document.filename).replace(/[\r\n"]/g, "")}"`);
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export function onRequest() {
  return json({ message: "Method not allowed." }, 405);
}
