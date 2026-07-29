import { createAdminNotification, recalculateAllRanks } from "./_pipeline.js";
import { clean, nowIso } from "./_workforce-db.js";

function parseJson(value, fallback = {}) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }

async function enqueue(db, { ruleId, candidateId, eventKey, input = {}, scheduledFor = nowIso() }) {
  await db.prepare(`INSERT OR IGNORE INTO automation_runs
    (id, rule_id, candidate_id, event_key, status, attempt_count, input_json, scheduled_for, created_at)
    VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, ?)`)
    .bind(crypto.randomUUID(), ruleId, candidateId || null, eventKey, JSON.stringify(input), scheduledFor, nowIso()).run();
}

export async function discoverAutopilotWork(env) {
  const db = env.WORKFORCE_DB;
  const rules = await db.prepare("SELECT * FROM automation_rules WHERE enabled = 1 ORDER BY priority ASC").all();
  const candidates = await db.prepare(`SELECT id, first_name, last_name, email, status, recruitment_stage, last_activity_at, created_at
    FROM candidates WHERE status IN ('applicant','invited','onboarding','correction_required','completed') LIMIT 1000`).all();
  const byKey = new Map((rules.results || []).map((r) => [r.rule_key, r]));
  for (const c of candidates.results || []) {
    const last = Date.parse(c.last_activity_at || c.created_at || nowIso());
    if (c.status === 'invited' && Date.now() - last >= 86400000 && byKey.has('invite-reminder-24h')) {
      const day = new Date().toISOString().slice(0,10);
      await enqueue(db, { ruleId: byKey.get('invite-reminder-24h').id, candidateId: c.id, eventKey: `invite-reminder:${c.id}:${day}`, input: c });
    }
    if (['invited','onboarding'].includes(c.status) && Date.now() - last >= 259200000 && byKey.has('stale-candidate-72h')) {
      const week = `${new Date().getUTCFullYear()}-${Math.ceil((Date.now()/86400000)/7)}`;
      await enqueue(db, { ruleId: byKey.get('stale-candidate-72h').id, candidateId: c.id, eventKey: `stalled:${c.id}:${week}`, input: c });
    }
  }
  const submitted = await db.prepare(`SELECT cp.id, cp.candidate_id, c.first_name, c.last_name
    FROM candidate_prescreens cp JOIN candidates c ON c.id=cp.candidate_id WHERE cp.status='submitted' LIMIT 300`).all().catch(() => ({ results: [] }));
  const rule = byKey.get('prescreen-ready');
  if (rule) for (const row of submitted.results || []) await enqueue(db, { ruleId: rule.id, candidateId: row.candidate_id, eventKey: `prescreen-ready:${row.id}`, input: row });
}

async function executeRun(env, run, rule) {
  const db = env.WORKFORCE_DB;
  const input = parseJson(run.input_json);
  const candidate = run.candidate_id ? await db.prepare("SELECT * FROM candidates WHERE id=? LIMIT 1").bind(run.candidate_id).first() : null;
  const name = candidate ? `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() : clean(`${input.first_name || ''} ${input.last_name || ''}`, 180) || 'Candidate';
  if (rule.action_type === 'admin_notification') {
    const stale = rule.rule_key === 'stale-candidate-72h';
    await createAdminNotification(env, {
      candidateId: run.candidate_id,
      notificationType: 'automation', toneKey: stale ? 'attention' : 'automation',
      title: stale ? 'Candidate journey needs attention' : 'Autopilot review ready',
      message: stale ? `${name} has had no recorded activity for at least 72 hours.` : `${name} has a recruitment item ready for administrator review.`,
      actionUrl: `/workforce_admin/#candidate=${encodeURIComponent(run.candidate_id || '')}`,
      uniqueKey: run.event_key,
    });
  } else if (rule.action_type === 'candidate_notification' && run.candidate_id) {
    const title = rule.rule_key === 'invite-reminder-24h' ? 'Your secure invitation is waiting' : 'Recruitment journey updated';
    const message = rule.rule_key === 'invite-reminder-24h'
      ? 'Your Brownstone Careers invitation remains available. Sign in with your candidate ID and current personal access code to continue.'
      : 'A verified stage in your Brownstone Careers journey has been completed. Open your dashboard to review the next step.';
    await db.prepare(`INSERT INTO candidate_notifications (id,candidate_id,notification_type,title,message,status,created_at)
      VALUES (?,?,?, ?,?,'unread',?)`).bind(crypto.randomUUID(), run.candidate_id, rule.template_key || 'automation', title, message, nowIso()).run();
  }
  await db.prepare(`INSERT INTO candidate_journey_events
    (id,candidate_id,stage_key,event_type,source,title,detail,visibility,metadata_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), run.candidate_id, rule.stage_key, 'automation_executed', 'autopilot', rule.name, rule.description || '', 'admin', JSON.stringify({ runId: run.id, ruleKey: rule.rule_key }), nowIso()).run().catch(() => null);
}

export async function runAutopilot(env, { limit = 50 } = {}) {
  if (!env?.WORKFORCE_DB) throw new Error('WORKFORCE_DB is not configured.');
  await discoverAutopilotWork(env);
  const db = env.WORKFORCE_DB;
  const rows = await db.prepare(`SELECT ar.*, r.rule_key, r.name, r.description, r.action_type, r.template_key, r.stage_key
    FROM automation_runs ar JOIN automation_rules r ON r.id=ar.rule_id
    WHERE ar.status IN ('queued','retry') AND datetime(ar.scheduled_for)<=datetime('now')
    ORDER BY r.priority ASC, ar.created_at ASC LIMIT ?`).bind(Math.max(1, Math.min(200, Number(limit)||50))).all();
  let completed = 0, failed = 0;
  for (const run of rows.results || []) {
    await db.prepare("UPDATE automation_runs SET status='running', started_at=?, attempt_count=attempt_count+1 WHERE id=?").bind(nowIso(), run.id).run();
    try {
      await executeRun(env, run, run);
      await db.prepare("UPDATE automation_runs SET status='completed', completed_at=?, output_json=? WHERE id=?").bind(nowIso(), JSON.stringify({ ok: true }), run.id).run();
      completed += 1;
    } catch (error) {
      await db.prepare("UPDATE automation_runs SET status=CASE WHEN attempt_count<3 THEN 'retry' ELSE 'failed' END,error_message=?,scheduled_for=datetime('now','+15 minutes') WHERE id=?").bind(clean(error?.message || String(error), 1000), run.id).run();
      failed += 1;
    }
  }
  await recalculateAllRanks(env).catch(() => null);
  const health = await getAutopilotHealth(env);
  await db.prepare("INSERT INTO operations_health_snapshots (id,snapshot_json,created_at) VALUES (?,?,?)").bind(crypto.randomUUID(), JSON.stringify(health), nowIso()).run().catch(() => null);
  return { discovered: true, processed: (rows.results || []).length, completed, failed, health };
}

export async function getAutopilotHealth(env) {
  const db = env.WORKFORCE_DB;
  const [rules, runs, stalled, pendingReview] = await Promise.all([
    db.prepare("SELECT COUNT(*) total,SUM(enabled) enabled FROM automation_rules").first(),
    db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status IN ('queued','retry') THEN 1 ELSE 0 END) queued,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed FROM automation_runs").first(),
    db.prepare("SELECT COUNT(*) count FROM candidates WHERE status IN ('invited','onboarding') AND datetime(COALESCE(last_activity_at,created_at))<datetime('now','-72 hours')").first(),
    db.prepare("SELECT COUNT(*) count FROM candidate_prescreens WHERE status='submitted'").first().catch(() => ({ count: 0 })),
  ]);
  return { rules: { total:Number(rules?.total||0), enabled:Number(rules?.enabled||0) }, runs: { total:Number(runs?.total||0), queued:Number(runs?.queued||0), failed:Number(runs?.failed||0), completed:Number(runs?.completed||0) }, stalledCandidates:Number(stalled?.count||0), pendingPrescreenReviews:Number(pendingReview?.count||0), checkedAt:nowIso() };
}
