import { requireAdmin } from "../../_admin-auth.js";
import { PIPELINE_STAGES, recalculateAllRanks } from "../../_pipeline.js";
import { clean, hasWorkforceDb, json } from "../../_workforce-db.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context, "candidate.rank");
  if (auth.response) return auth.response;
  if (!hasWorkforceDb(context.env)) return json({ message: "WORKFORCE_DB is not configured." }, 503);
  await recalculateAllRanks(context.env);
  const url = new URL(context.request.url);
  const role = clean(url.searchParams.get("role") || "all", 160);
  const stage = clean(url.searchParams.get("stage") || "all", 60);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 20)));
  const offset = (page - 1) * pageSize;
  const conditions = [];
  const values = [];
  if (role !== "all") { conditions.push("c.role = ?"); values.push(role); }
  if (stage !== "all") { conditions.push("c.recruitment_stage = ?"); values.push(stage); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows, count, roleRows] = await Promise.all([
    context.env.WORKFORCE_DB.prepare(`
      SELECT c.id, c.first_name, c.last_name, c.email, c.role, c.status, c.recruitment_stage,
             c.onboarding_progress, c.prescreening_score, c.pipeline_score, c.pipeline_rank,
             c.application_submitted_at, c.invitation_origin, c.last_activity_at, c.created_at
      FROM candidates c ${where}
      ORDER BY c.pipeline_rank ASC, COALESCE(c.last_activity_at, c.created_at) DESC
      LIMIT ? OFFSET ?
    `).bind(...values, pageSize, offset).all(),
    context.env.WORKFORCE_DB.prepare(`SELECT COUNT(*) AS count FROM candidates c ${where}`).bind(...values).first(),
    context.env.WORKFORCE_DB.prepare("SELECT DISTINCT role FROM candidates WHERE role IS NOT NULL AND trim(role) <> '' ORDER BY role").all(),
  ]);
  const ids = (rows.results || []).map((row) => row.id);
  let stageRows = [];
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const result = await context.env.WORKFORCE_DB.prepare(`
      SELECT candidate_id, stage_key, status, completion_percent, score, completed_at
      FROM candidate_stage_progress WHERE candidate_id IN (${placeholders})
    `).bind(...ids).all();
    stageRows = result.results || [];
  }
  const byCandidate = new Map();
  for (const row of stageRows) {
    if (!byCandidate.has(row.candidate_id)) byCandidate.set(row.candidate_id, {});
    byCandidate.get(row.candidate_id)[row.stage_key] = row;
  }
  return json({
    stages: PIPELINE_STAGES,
    roles: (roleRows.results || []).map((row) => row.role),
    pagination: {
      page,
      pageSize,
      total: Number(count?.count || 0),
      totalPages: Math.max(1, Math.ceil(Number(count?.count || 0) / pageSize)),
    },
    rankings: (rows.results || []).map((candidate) => {
      const stages = byCandidate.get(candidate.id) || {};
      const weightedStages = PIPELINE_STAGES.filter((item) => item.weight > 0);
      const completedStageCount = weightedStages.filter((item) => stages[item.key]?.status === "completed").length;
      const inProgressStageCount = weightedStages.filter((item) => stages[item.key]?.status === "in_progress").length;
      return {
        ...candidate,
        stages,
        completed_stage_count: completedStageCount,
        in_progress_stage_count: inProgressStageCount,
        total_ranked_stages: weightedStages.length,
      };
    }),
  });
}

export function onRequest() { return json({ message: "Method not allowed." }, 405); }
