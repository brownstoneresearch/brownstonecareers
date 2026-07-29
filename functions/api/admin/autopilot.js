import { requireAdmin } from "../../_admin-auth.js";
import { getAutopilotHealth, runAutopilot } from "../../_autopilot.js";
import { clean, hasWorkforceDb, json, nowIso } from "../../_workforce-db.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context, "automation.manage");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  const [health, rules, runs] = await Promise.all([
    getAutopilotHealth(context.env),
    context.env.WORKFORCE_DB.prepare("SELECT * FROM automation_rules ORDER BY priority,name").all(),
    context.env.WORKFORCE_DB.prepare(`SELECT ar.*,r.name rule_name,c.first_name,c.last_name FROM automation_runs ar LEFT JOIN automation_rules r ON r.id=ar.rule_id LEFT JOIN candidates c ON c.id=ar.candidate_id ORDER BY ar.created_at DESC LIMIT 100`).all(),
  ]);
  return json({ health, rules: rules.results || [], runs: runs.results || [] });
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context, "automation.manage");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  const body = await context.request.json().catch(() => ({}));
  if (body.action === 'run') return json(await runAutopilot(context.env, { limit: body.limit || 75 }));
  if (body.action === 'toggle') {
    const id = clean(body.ruleId, 120); if (!id) return json({ message:'Rule ID is required.' },400);
    await context.env.WORKFORCE_DB.prepare("UPDATE automation_rules SET enabled=?,updated_at=? WHERE id=?").bind(body.enabled ? 1 : 0, nowIso(), id).run();
    return json({ ok:true });
  }
  return json({ message:'Unsupported automation action.' },400);
}
export function onRequest() { return json({ message:'Method not allowed.' },405); }
