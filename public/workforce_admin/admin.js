(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let summary = null;
  let candidates = [];
  let capabilities = {};
  let permissions = [];
  let selectedCandidate = null;
  let candidatePage = 1;
  let candidatePagination = { page: 1, totalPages: 1, total: 0, pageSize: 20 };
  let activityPage = 1;

  const invitationStatusRules = Object.freeze({
    invited: ["application_received", "pre_screening", "assessment", "interview", "offer", "verification", "onboarding", "orientation", "active_worker"],
    approved: ["application_received", "pre_screening", "assessment", "interview", "offer", "verification", "onboarding", "orientation"],
    onboarding: ["onboarding", "orientation"],
    correction_required: ["application_received", "pre_screening", "assessment", "interview", "offer", "verification", "onboarding", "orientation", "active_worker"],
    completed: ["onboarding", "orientation", "active_worker"],
    active: ["active_worker"],
  });
  const invitationStageTemplates = Object.freeze({
    application_received: { label: "Application", eyebrow: "Secure application access", title: "Continue Your Brownstone Application" },
    pre_screening: { label: "Pre-screening", eyebrow: "Pre-screening stage access", title: "Pre-Screening Portal Access" },
    assessment: { label: "Skills assessment", eyebrow: "Assessment stage access", title: "Skills Assessment Portal Access" },
    interview: { label: "Interview", eyebrow: "Interview stage access", title: "Interview Stage Portal Access" },
    offer: { label: "Offer", eyebrow: "Offer stage access", title: "Offer Review Portal Access" },
    verification: { label: "Verification", eyebrow: "Verification stage access", title: "Verification Portal Access" },
    onboarding: { label: "Onboarding", eyebrow: "Onboarding stage access", title: "Onboarding Portal Access" },
    orientation: { label: "Orientation", eyebrow: "Orientation stage access", title: "Orientation Portal Access" },
    active_worker: { label: "Active worker", eyebrow: "Workforce activation", title: "Brownstone Workforce Access" },
  });
  const invitationStatusLabels = Object.freeze({
    invited: "Invited",
    approved: "Approved",
    onboarding: "Onboarding",
    correction_required: "Correction required",
    completed: "Completed",
    active: "Active worker",
  });

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function initials(name = "BC") {
    return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "BC";
  }

  function formatDate(value) {
    if (!value) return "Not available";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  }

  function statusLabel(value = "") {
    return String(value).replaceAll("_", " ");
  }

  function can(permission) {
    return permissions.includes("*") || permissions.includes(permission);
  }


  function renderSmartPagination(selector, pagination, onPage) {
    const nav = $(selector);
    if (!nav) return;
    const page = Number(pagination?.page || 1);
    const pages = Math.max(1, Number(pagination?.totalPages || 1));
    const total = Number(pagination?.total || 0);
    if (pages <= 1) { nav.hidden = true; nav.innerHTML = total ? `<span>${total} record${total === 1 ? "" : "s"}</span>` : ""; return; }
    nav.hidden = false;
    const start = Math.max(1, Math.min(page - 2, pages - 4));
    const end = Math.min(pages, start + 4);
    const buttons = [];
    for (let value = start; value <= end; value += 1) buttons.push(`<button type="button" class="${value === page ? "active" : ""}" data-page="${value}">${value}</button>`);
    nav.innerHTML = `<button type="button" data-page="${page - 1}" ${page === 1 ? "disabled" : ""}>← Previous</button><span>${total.toLocaleString("en-US")} records · Page ${page} of ${pages}</span>${buttons.join("")}<button type="button" data-page="${page + 1}" ${page === pages ? "disabled" : ""}>Next →</button>`;
    $$('[data-page]', nav).forEach((button) => button.addEventListener("click", () => {
      const target = Number(button.dataset.page);
      if (!Number.isFinite(target) || target < 1 || target > pages || target === page) return;
      onPage(target);
    }));
  }

  function journeyBoardHtml(journey) {
    if (!journey?.stages?.length) return '<p>Journey orchestration data is not yet available.</p>';
    const directive = journey.directive || {};
    const type = directive.type || "waiting";
    return `<div class="admin-journey-command ${escapeHtml(type)}"><div class="admin-directive-icon">${type === "action" ? "→" : type === "correction" ? "!" : type === "complete" ? "✓" : "⌛"}</div><div><span>NEXT DIRECTIVE · ${escapeHtml(statusLabel(journey.currentStage?.label || journey.currentStage?.key || "stage"))}</span><h4>${escapeHtml(directive.title || "Review candidate journey")}</h4><p>${escapeHtml(directive.message || "Confirm the current stage evidence before advancing.")}</p>${directive.waitingFor ? `<small>Waiting for: ${escapeHtml(directive.waitingFor)}</small>` : ""}</div></div>
      <div class="admin-journey-grid">${journey.stages.map((stage, index) => `<article class="admin-journey-stage ${escapeHtml(stage.access || stage.status)}"><i>${stage.status === "completed" ? "✓" : String(index + 1).padStart(2, "0")}</i><div><strong>${escapeHtml(stage.label)}</strong><small>${escapeHtml(stage.status === "completed" ? "Verified complete" : stage.access === "current" ? "Current controlled stage" : stage.locked ? `Locked by ${statusLabel(stage.blockedBy || "previous stage")}` : statusLabel(stage.access || "pending"))}</small><p>${escapeHtml(stage.evidenceReason || "Administrator evidence required.")}</p></div><b>${Math.round(Number(stage.percent || 0))}%</b></article>`).join("")}</div>`;
  }
  function toast(message) {
    const element = $("[data-admin-toast]");
    if (!element) return;
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 2800);
  }

  function showRuntimeError(message, incident = "") {
    const alert = $("[data-admin-runtime-alert]");
    if (!alert) return;
    const messageBox = $("[data-admin-runtime-message]", alert);
    const incidentBox = $("[data-admin-runtime-incident]", alert);
    if (messageBox) messageBox.textContent = message || "A server-side workforce service did not respond.";
    if (incidentBox) incidentBox.textContent = incident ? `Incident: ${incident}` : "";
    alert.hidden = false;
  }

  function clearRuntimeError() {
    const alert = $("[data-admin-runtime-alert]");
    if (alert) alert.hidden = true;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
      ...options,
    });
    const contentType = response.headers.get("content-type") || "";
    let data = {};
    if (contentType.includes("application/json")) {
      data = await response.json().catch(() => ({}));
    } else {
      const text = await response.text().catch(() => "");
      data = { message: response.ok ? "The workforce API returned an unexpected page instead of JSON." : (text.match(/<title>(.*?)<\/title>/i)?.[1] || `Request failed with status ${response.status}.`) };
    }
    if (response.status === 401) {
      location.href = "/workforce_admin/";
      throw new Error("Administrator session expired.");
    }
    if (!response.ok) {
      const error = new Error(data.message || `Request failed with status ${response.status}.`);
      error.incident = data.incident || "";
      throw error;
    }
    return data;
  }

  function setView(view) {
    $$("[data-view]").forEach((element) => element.classList.toggle("active", element.dataset.view === view));
    $$("[data-admin-view]").forEach((button) => button.classList.toggle("active", button.dataset.adminView === view));
    $("[data-page-title]").textContent = ({ overview: "Workforce overview", candidates: "Candidate management", autopilot: "Autonomous operations", rankings: "Candidate rankings", prescreen: "Pre-screening management", submissions: "Submission review", support: "AI & human support", activity: "Audit activity", settings: "System status" })[view] || "Administration";
    $("#adminSidebar").classList.remove("open");
    if (view === "candidates") loadCandidates();
    if (view === "activity") loadActivity();
  }

  async function loadSession() {
    const data = await api("/api/admin/session");
    clearRuntimeError();
    const admin = data.admin || {};
    capabilities = data.capabilities || {};
    permissions = data.permissions || [];
    $$('[data-open-invite]').forEach((button) => { button.hidden = !can("candidate.invite"); });
    $("[data-admin-name]").textContent = admin.name || admin.email || "Administrator";
    $("[data-admin-role]").textContent = statusLabel(admin.role || "authorized user");
    $("[data-admin-initials]").textContent = initials(admin.name || admin.email);
    renderSystemStatus();
  }

  function renderSystemStatus() {
    const emailChannels = capabilities.emailChannels || {};
    const items = [
      ["Workforce database", capabilities.workforceDatabase, "Candidate records, invitations, progress, and audit events"],
      ["Private document storage", capabilities.privateDocuments, capabilities.privateDocuments ? "Private R2 storage is bound for resumes, identity, and verification documents" : "Create and bind the private R2 bucket as PRIVATE_DOCUMENTS"],
      ["Recruitment email", emailChannels.recruitment, "Applications, contact submissions, and public confirmations"],
      ["Controlled invitation origins", capabilities.applicationFirstInvites && capabilities.adminControlledManualInvites, "Invite from a submitted application or use an audited administrator manual override with a recorded reason"],
      ["Ranked recruitment pipeline", capabilities.rankedPipeline, "Candidates are ranked by verified stage completion—not by protected traits or an automated hiring decision"],
      ["Sequential journey gates", capabilities.sequentialJourneyEnforced, "Every stage is server-locked until all prior stages are verified complete"],
      ["Candidate next directive", capabilities.candidateNextDirective, "Candidates always see whether to act, correct, or wait for an official result"],
      ["Smart queue pagination", capabilities.smartPagination, "Candidate, ranking, pre-screening, submission, support, notification, and audit queues are paginated"],
      ["Stage completion alerts", capabilities.stageNotifications, "Every completed stage creates an administrator notification with a distinct optional tone"],
      ["Managed pre-screening", capabilities.prescreenManagement, capabilities.aiPrescreenGrading ? "Administrator-managed questions with optional AI rubric drafts and mandatory human final review" : "Administrator-managed questions and human review are ready; OPENAI_API_KEY enables advisory rubric drafts"],
      ["Candidate invitation email", emailChannels.candidateInvites, "Protected portal credentials sent through the unified Resend channel"],
      ["Access-code delivery", emailChannels.accessCodes, "Regenerated and replacement candidate access credentials"],
      ["Onboarding notices", emailChannels.onboarding, "Correction requests and onboarding workflow notifications"],
      ["Workforce email", emailChannels.workforce, "Administrator and workforce operational notifications"],
      ["Cloudflare Access", capabilities.cloudflareAccess, "Identity-aware protection for workforce.brownstonecareers.agency"],
      ["Brownstone Guide AI", true, capabilities.aiGenerative ? "Generative, context-aware assistance with safe human escalation" : "Operational guided support with task-aware answers and human escalation; generative mode is optional"],
      ["Supabase migration target", capabilities.supabase, capabilities.supabase ? "PostgreSQL, Auth, RLS, private Storage, and Realtime migration target configured" : "Optional migration kit included; D1 and R2 remain the active compatibility backend"],
    ];
    $("[data-system-grid]").innerHTML = items.map(([title, ready, description]) => `<article class="system-card${ready ? " ready" : ""}"><i></i><h3>${escapeHtml(title)}</h3><p><strong>${ready ? "Ready" : "Action required"}</strong><br>${escapeHtml(description)}</p></article>`).join("");
  }

  async function loadSummary() {
    try {
      summary = await api("/api/admin/summary");
      Object.entries(summary.counts || {}).forEach(([key, value]) => {
        const element = $(`[data-metric="${key}"]`);
        if (element) element.textContent = value;
      });
      renderRecentCandidates();
      renderRecentActivity();
    } catch (error) {
      toast(error.message);
      showRuntimeError(error.message, error.incident);
      $("[data-recent-candidates]").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
      $("[data-recent-activity]").innerHTML = `<div class="empty-state">System activity is unavailable.</div>`;
    }
  }

  function candidateRow(candidate) {
    const name = `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || "Candidate";
    return `<article class="candidate-row"><span class="avatar">${escapeHtml(initials(name))}</span><div><h3>${escapeHtml(name)}</h3><p>${escapeHtml(candidate.role || "Role not assigned")}</p><small>${escapeHtml(candidate.id || "")}</small></div><span class="status-pill ${escapeHtml(candidate.status || "")}">${escapeHtml(statusLabel(candidate.status || "unknown"))}</span></article>`;
  }

  function activityRow(event) {
    return `<article class="activity-row"><span class="avatar">↻</span><div><h3>${escapeHtml(statusLabel(event.event_type || "Activity"))}</h3><p>${escapeHtml(event.description || "System activity")}</p><small>${escapeHtml(formatDate(event.created_at))}</small></div></article>`;
  }

  function renderRecentCandidates() {
    const list = summary?.recentCandidates || [];
    $("[data-recent-candidates]").innerHTML = list.length ? list.map(candidateRow).join("") : '<div class="empty-state">No candidate records yet.</div>';
  }

  function renderRecentActivity() {
    const list = summary?.recentActivity || [];
    $("[data-recent-activity]").innerHTML = list.length ? list.map(activityRow).join("") : '<div class="empty-state">No material activity recorded yet.</div>';
  }

  async function loadActivity() {
    const target = $("[data-full-activity]");
    const search = $("[data-activity-search]")?.value.trim() || "";
    if (target) target.innerHTML = '<div class="empty-state">Loading audit activity…</div>';
    try {
      const params = new URLSearchParams({ page: String(activityPage), pageSize: "20", search });
      const data = await api(`/api/admin/activity?${params}`);
      const items = data.activity || [];
      if (target) target.innerHTML = items.length ? items.map(activityRow).join("") : '<div class="empty-state">No material activity matches this view.</div>';
      renderSmartPagination("[data-activity-pagination]", data.pagination, (page) => { activityPage = page; loadActivity(); });
    } catch (error) {
      if (target) target.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadCandidates() {
    const search = $("[data-candidate-search]")?.value.trim() || "";
    const status = $("[data-status-filter]")?.value || "all";
    const params = new URLSearchParams({ search, status, page: String(candidatePage), pageSize: "20" });
    try {
      const data = await api(`/api/admin/candidates?${params}`);
      candidates = data.candidates || [];
      candidatePagination = data.pagination || { page: candidatePage, pageSize: 20, total: candidates.length, totalPages: 1 };
      candidatePage = Number(candidatePagination.page || candidatePage);
      renderCandidateTable();
      renderSmartPagination("[data-candidate-pagination]", candidatePagination, (page) => { candidatePage = page; loadCandidates(); });
    } catch (error) {
      toast(error.message);
      $("[data-candidate-table]").innerHTML = `<tr><td colspan="6"><div class="empty-state">${escapeHtml(error.message)}</div></td></tr>`;
    }
  }

  function renderCandidateTable() {
    const body = $("[data-candidate-table]");
    if (!candidates.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty-state">No candidates match the current filter.</div></td></tr>';
      return;
    }
    body.innerHTML = candidates.map((candidate) => {
      const name = `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || "Candidate";
      const progress = Number(candidate.pipeline_score ?? candidate.onboarding_progress ?? 0);
      return `<tr><td><strong>${escapeHtml(name)}</strong><small>${escapeHtml(candidate.email || "")} · ${escapeHtml(candidate.id)}</small></td><td>${escapeHtml(candidate.role || "—")}</td><td><span class="status-pill ${escapeHtml(candidate.status || "")}">${escapeHtml(statusLabel(candidate.recruitment_stage || candidate.status))}</span><small class="stage-lock-copy">Sequential stage ${escapeHtml(statusLabel(candidate.recruitment_stage || "application"))}</small></td><td class="progress-cell"><strong>${candidate.pipeline_rank ? `#${Number(candidate.pipeline_rank)} · ` : ""}${progress}%</strong><div class="progress-line"><i style="width:${Math.max(0, Math.min(100, progress))}%"></i></div><small>Verified journey completion</small></td><td>${escapeHtml(formatDate(candidate.last_activity_at || candidate.created_at))}</td><td><button class="table-action" type="button" data-candidate-id="${escapeHtml(candidate.id)}">Open journey →</button></td></tr>`;
    }).join("");
    $$('[data-candidate-id]', body).forEach((button) => button.addEventListener("click", () => openCandidate(button.dataset.candidateId)));
  }

  async function openCandidate(id) {
    try {
      const data = await api(`/api/admin/candidate?id=${encodeURIComponent(id)}`);
      selectedCandidate = data;
      const candidate = data.candidate;
      const name = `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || "Candidate";
      $("[data-drawer-name]").textContent = name;
      $("[data-drawer-id]").textContent = `${candidate.id} · ${candidate.email}`;
      $("[data-drawer-body]").innerHTML = candidateDetailHtml(data);
      bindDrawerActions(data);
      loadCandidateWorkflow(candidate.id);
      $("[data-candidate-drawer]").classList.add("open");
      $("[data-candidate-drawer]").setAttribute("aria-hidden", "false");
      $("[data-drawer-overlay]").classList.add("open");
    } catch (error) {
      toast(error.message);
    }
  }

  function candidateDetailHtml(data) {
    const candidate = data.candidate;
    const identity = data.identity;
    const documents = data.documents || [];
    const activity = data.activity || [];
    const invitations = data.invitations || [];
    const stageProgress = data.stageProgress || [];
    const prescreens = data.prescreens || [];
    const latestInvite = invitations[0];
    const applicationEligible = Boolean(candidate.application_submitted_at) && ["applicant", "approved"].includes(candidate.status);
    const applicationOrigin = candidate.application_submitted_at
      ? `<p><strong>Application reference:</strong> ${escapeHtml(candidate.reference || "—")}<br><strong>Invitation origin:</strong> ${escapeHtml(statusLabel(candidate.invitation_origin || candidate.application_source || "application"))}<br><strong>Submitted:</strong> ${escapeHtml(formatDate(candidate.application_submitted_at))}</p>`
      : candidate.invitation_origin === "admin_manual"
        ? `<p><strong>Invitation origin:</strong> Manual administrator override<br><strong>Authorized:</strong> ${escapeHtml(formatDate(candidate.manual_invite_approved_at))}<br><strong>Reason:</strong> ${escapeHtml(candidate.manual_invite_reason || "Documented in audit trail")}</p>`
        : '<p>No submitted application or controlled manual invitation is recorded.</p>';
    const accessActions = latestInvite
      ? (can("invitation.manage") ? '<div class="drawer-actions"><button class="primary-button" type="button" data-regenerate-code>Regenerate and email code</button><button class="secondary-button" type="button" data-revoke-access>Revoke access</button></div>' : '<p class="permission-note">Your role has read-only access to invitations.</p>')
      : (applicationEligible && can("candidate.invite") ? `<button class="primary-button" type="button" data-invite-from-application="${escapeHtml(candidate.id)}">Invite from this application</button>` : '');
    return `<div class="drawer-summary"><div><span>Status</span><strong>${escapeHtml(statusLabel(candidate.status))}</strong></div><div><span>Stage</span><strong>${escapeHtml(statusLabel(data.journey?.currentStage?.label || candidate.recruitment_stage))}</strong></div><div><span>Pipeline score</span><strong>${Number(candidate.pipeline_score ?? candidate.onboarding_progress ?? 0)}%</strong></div><div><span>Rank</span><strong>${candidate.pipeline_rank ? `#${Number(candidate.pipeline_rank)}` : "—"}</strong></div></div>
      <section class="drawer-section journey-control-section"><div class="drawer-section-heading"><div><span>ORDERED RECRUITMENT JOURNEY</span><h3>Stage control and next directive</h3></div><strong>${Number(data.journey?.completedCount || 0)}/${Number(data.journey?.totalStages || 9)}</strong></div>${journeyBoardHtml(data.journey)}</section>
      <section class="drawer-section application-origin-section"><h3>Application origin</h3>${applicationOrigin}${candidate.invited_from_application_at ? `<p><strong>Invitation created from application:</strong> ${escapeHtml(formatDate(candidate.invited_from_application_at))}</p>` : ""}</section>
      <section class="drawer-section"><h3>Candidate details</h3><p><strong>Role:</strong> ${escapeHtml(candidate.role || "—")}<br><strong>Phone:</strong> ${escapeHtml(candidate.phone || "—")}<br><strong>Location:</strong> ${escapeHtml([candidate.city, candidate.state_province, candidate.country].filter(Boolean).join(", ") || "—")}<br><strong>Last activity:</strong> ${escapeHtml(formatDate(candidate.last_activity_at || candidate.created_at))}</p></section>
      <section class="drawer-section"><h3>Personal access</h3><p>${latestInvite ? `Latest invitation: <strong>${escapeHtml(statusLabel(latestInvite.status))}</strong><br>Candidate ID: <strong>${escapeHtml(candidate.id)}</strong><br>Code ending: <strong>••••${escapeHtml(latestInvite.code_hint || "")}</strong><br>Selected status: <strong>${escapeHtml(statusLabel(latestInvite.initial_status || candidate.invitation_status_key || candidate.status))}</strong><br>Selected stage: <strong>${escapeHtml(statusLabel(latestInvite.initial_stage || candidate.invitation_stage_key || candidate.recruitment_stage))}</strong><br>Template: <strong>${escapeHtml(statusLabel(latestInvite.template_key || candidate.invitation_template_key || "secure-application.invited"))}</strong><br>Expires: ${escapeHtml(formatDate(latestInvite.expires_at))}` : "No invitation exists."}</p>${accessActions}</section>

      <section class="drawer-section"><h3>Stage audit history</h3>${stageProgress.length ? `<div class="candidate-stage-timeline">${stageProgress.map((stage) => `<article class="candidate-stage-row ${escapeHtml(stage.status)}"><i>${stage.status === "completed" ? "✓" : ""}</i><div><strong>${escapeHtml(statusLabel(stage.stage_key))}</strong><small>${Number(stage.completion_percent || 0)}%${stage.score == null ? "" : ` · score ${Number(stage.score).toFixed(1)}%`} · ${escapeHtml(statusLabel(stage.source || "system"))}</small>${stage.notes ? `<p>${escapeHtml(stage.notes)}</p>` : ""}</div></article>`).join("")}</div>` : "<p>No stage milestones recorded yet.</p>"}</section>
      <section class="drawer-section"><h3>Pre-screening history</h3>${prescreens.length ? prescreens.map((item) => `<div class="document-row"><div><strong>${escapeHtml(item.question_set_title || "Pre-screening")}</strong><small>${escapeHtml(statusLabel(item.status))}${item.final_score == null ? "" : ` · ${Number(item.final_score).toFixed(1)}%`} · ${escapeHtml(formatDate(item.submitted_at || item.due_at))}</small></div>${can("prescreen.read") ? `<button class="table-action" type="button" data-open-prescreen-assignment="${escapeHtml(item.id)}">Open →</button>` : ""}</div>`).join("") : "<p>No pre-screening assignment has been recorded.</p>"}</section>
      <section class="drawer-section"><h3>Secure identity status</h3><p>${identity ? `Verification: <strong>${escapeHtml(statusLabel(identity.verification_status))}</strong><br>SSN on file: <strong>${escapeHtml(identity.maskedSsn || "Not submitted")}</strong><br>Submitted: ${escapeHtml(formatDate(identity.submitted_at))}` : "Sensitive identity details have not been submitted."}</p>${identity && can("identity.review") ? `<div class="drawer-actions"><button class="primary-button" type="button" data-identity-approve>Approve identity</button><button class="secondary-button" type="button" data-identity-correction>Request correction</button></div>` : ""}</section>
      <section class="drawer-section"><h3>Private documents</h3>${documents.length ? documents.map((document) => `<div class="document-row"><div><strong>${escapeHtml(statusLabel(document.category))}</strong><small>${escapeHtml(document.filename)} · ${escapeHtml(statusLabel(document.status))}</small></div>${can("document.view") ? `<a href="/api/admin/document?id=${encodeURIComponent(document.id)}" target="_blank" rel="noopener">Download securely</a>` : '<span class="permission-note">Restricted</span>'}</div>`).join("") : "<p>No private documents submitted.</p>"}</section>
      <section class="drawer-section"><div class="drawer-section-heading"><h3>Assigned tasks and submissions</h3><button class="secondary-button compact-button" type="button" data-assign-candidate-task="${escapeHtml(candidate.id)}">Assign task</button></div><div data-candidate-workflow-panel><div class="empty-state">Loading task history…</div></div></section>
      ${can("candidate.status") ? '<section class="drawer-section"><h3>Status and stage</h3><div class="form-grid"><label>Status<select data-update-status><option value="applicant">Applicant</option><option value="approved">Approved</option><option value="invited" disabled>Invited (managed by access workflow)</option><option value="onboarding">Onboarding</option><option value="correction_required">Correction required</option><option value="completed">Completed</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="rejected">Rejected</option></select></label><label>Stage (controlled by completion)<select data-update-stage disabled><option value="application_received">Application received</option><option value="pre_screening">Pre-screening</option><option value="assessment">Assessment</option><option value="interview">Interview</option><option value="offer">Offer</option><option value="verification">Verification</option><option value="onboarding">Onboarding</option><option value="orientation">Orientation</option><option value="active_worker">Active worker</option></select></label></div><button class="primary-button" type="button" data-save-status>Save status</button></section>' : ''}
      ${can("candidate.stage") ? `<section class="drawer-section stage-completion-section"><h3>Verify and complete current stage</h3><p>The next stage remains locked until the current stage evidence is complete. Completion creates a unique stage alert, recalculates ranking, notifies the candidate, and publishes their next directive.</p><div class="form-grid"><label>Stage score<input data-stage-score type="number" min="0" max="100" step="0.1" value="100"></label><label class="full">Completion note<textarea data-stage-note rows="3" placeholder="Record the job-related evidence supporting completion."></textarea></label></div><button class="primary-button" type="button" data-complete-stage>Complete stage and advance</button></section>` : ""}
      ${can("correction.request") ? '<section class="drawer-section"><h3>Request correction</h3><textarea rows="4" placeholder="Explain what the candidate should update…" data-correction-message></textarea><button class="secondary-button" type="button" data-request-correction>Send correction request</button></section>' : ''}
      <section class="drawer-section"><h3>Recent candidate activity</h3><div class="activity-list">${activity.length ? activity.slice(0, 20).map(activityRow).join("") : '<div class="empty-state">No activity recorded.</div>'}</div></section>`;
  }

  async function loadCandidateWorkflow(candidateId) {
    const panel = $(`[data-candidate-workflow-panel]`);
    if (!panel) return;
    try {
      const data = await api(`/api/admin/workflow?mode=candidate&candidateId=${encodeURIComponent(candidateId)}`);
      const tasks = data.tasks || [];
      if (!tasks.length) {
        panel.innerHTML = '<div class="empty-state">No tasks are assigned yet.</div>';
      } else {
        panel.innerHTML = `<div class="drawer-task-list">${tasks.map((task) => `<article class="drawer-task-row"><div><span>${escapeHtml(statusLabel(task.category || "onboarding"))}</span><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.due_at ? `Due ${formatDate(task.due_at)}` : "No due date")}${task.admin_feedback ? ` · ${escapeHtml(task.admin_feedback)}` : ""}</small></div><b class="status-pill ${escapeHtml(task.status)}">${escapeHtml(statusLabel(task.status))}</b></article>`).join("")}</div>`;
      }
      $(`[data-assign-candidate-task]`)?.addEventListener("click", () => window.dispatchEvent(new CustomEvent("brownstone:assign-task", { detail: { candidateId } })));
    } catch (error) {
      panel.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  function bindDrawerActions(data) {
    const candidate = data.candidate;
    const status = $("[data-update-status]");
    const stage = $("[data-update-stage]");
    if (status) status.value = candidate.status;
    if (stage) stage.value = candidate.recruitment_stage;
    const journeyStageKey = data.journey?.currentStage?.key || candidate.recruitment_stage;
    const journeyStageLabel = data.journey?.currentStage?.label || statusLabel(candidate.recruitment_stage);
    $$(`[data-open-prescreen-assignment]`).forEach((button) => button.addEventListener("click", () => { closeDrawer(); setView("prescreen"); location.hash = `prescreen=${encodeURIComponent(button.dataset.openPrescreenAssignment)}`; window.dispatchEvent(new CustomEvent("brownstone:open-prescreen", { detail: { id: button.dataset.openPrescreenAssignment } })); }));
    $("[data-invite-from-application]")?.addEventListener("click", () => openInviteModal(candidate.id));
    $("[data-save-status]")?.addEventListener("click", async () => {
      try {
        await api("/api/admin/candidates", { method: "PATCH", body: JSON.stringify({ action: "update-status", candidateId: candidate.id, status: status.value, stage: candidate.recruitment_stage }) });
        toast("Candidate status updated.");
        await refreshAfterAction(candidate.id);
      } catch (error) { toast(error.message); }
    });
    $("[data-complete-stage]")?.addEventListener("click", async () => {
      const scoreValue = Number($("[data-stage-score]")?.value || 100);
      const note = $("[data-stage-note]")?.value.trim() || "Stage requirements reviewed and completed by administrator.";
      if (!confirm(`Complete ${journeyStageLabel} and unlock the next controlled stage for this candidate?`)) return;
      try {
        const result = await api("/api/admin/candidates", { method: "PATCH", body: JSON.stringify({ action: "complete-stage", candidateId: candidate.id, stageKey: journeyStageKey, score: scoreValue, notes: note, advance: true }) });
        toast(`${statusLabel(result.stage?.label || journeyStageLabel)} completed. The next directive is now live.`);
        await refreshAfterAction(candidate.id);
      } catch (error) { toast(error.message); }
    });
    $("[data-request-correction]")?.addEventListener("click", async () => {
      const message = $("[data-correction-message]").value.trim();
      if (!message) return toast("Enter a correction message first.");
      try {
        const result = await api("/api/admin/candidates", { method: "PATCH", body: JSON.stringify({ action: "request-correction", candidateId: candidate.id, message }) });
        toast(result.emailSent ? "Correction request emailed." : "Correction recorded; email delivery needs attention.");
        await refreshAfterAction(candidate.id);
      } catch (error) { toast(error.message); }
    });
    $("[data-regenerate-code]")?.addEventListener("click", async () => {
      if (!confirm("Revoke the existing code and generate a new personalized invitation?")) return;
      try {
        const result = await api("/api/admin/invitations", { method: "POST", body: JSON.stringify({ action: "regenerate", candidateId: candidate.id }) });
        showAccessCode(result.accessCode, result.expiresAt, result.emailSent);
        await refreshAfterAction(candidate.id);
      } catch (error) { toast(error.message); }
    });
    $("[data-revoke-access]")?.addEventListener("click", async () => {
      if (!confirm("Revoke this candidate's portal access immediately?")) return;
      try {
        await api("/api/admin/invitations", { method: "POST", body: JSON.stringify({ action: "revoke", candidateId: candidate.id }) });
        toast("Candidate access revoked.");
        await refreshAfterAction(candidate.id);
      } catch (error) { toast(error.message); }
    });
    $("[data-identity-approve]")?.addEventListener("click", () => reviewIdentity(candidate.id, "approved"));
    $("[data-identity-correction]")?.addEventListener("click", () => reviewIdentity(candidate.id, "correction_required"));
  }

  async function reviewIdentity(candidateId, verificationStatus) {
    try {
      await api("/api/admin/candidates", { method: "PATCH", body: JSON.stringify({ action: "review-identity", candidateId, verificationStatus }) });
      toast(`Identity marked ${statusLabel(verificationStatus)}.`);
      await refreshAfterAction(candidateId);
    } catch (error) { toast(error.message); }
  }

  async function refreshAfterAction(candidateId) {
    await Promise.all([loadSummary(), loadCandidates()]);
    await openCandidate(candidateId);
  }

  function showAccessCode(code, expiresAt, emailSent) {
    const message = `Candidate access code: ${code}\nExpires: ${formatDate(expiresAt)}\nEmail sent: ${emailSent ? "Yes" : "No"}`;
    navigator.clipboard?.writeText(code).catch(() => {});
    alert(`${message}\n\nThe access code was copied to your clipboard. Store it securely; it will not be shown again.`);
  }

  async function loadEligibleApplications(preselectCandidateId = "") {
    const select = $("[data-application-select]");
    const preview = $("[data-application-preview]");
    if (!select) return [];
    select.disabled = true;
    select.innerHTML = '<option value="">Loading eligible applications…</option>';
    if (preview) preview.innerHTML = '<span>Checking the application queue…</span>';
    try {
      const data = await api("/api/admin/candidates?inviteEligible=1&limit=100");
      const applications = data.candidates || [];
      select.innerHTML = applications.length
        ? `<option value="">Select a submitted application</option>${applications.map((candidate) => {
            const name = `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || "Applicant";
            return `<option value="${escapeHtml(candidate.id)}">${escapeHtml(name)} — ${escapeHtml(candidate.role || "Role not selected")} — ${escapeHtml(candidate.reference || candidate.id)}</option>`;
          }).join("")}`
        : '<option value="">No eligible applications awaiting invitation</option>';
      select.disabled = !applications.length;
      select.dataset.applications = JSON.stringify(applications);
      if (preselectCandidateId && applications.some((candidate) => candidate.id === preselectCandidateId)) select.value = preselectCandidateId;
      renderApplicationPreview();
      return applications;
    } catch (error) {
      select.innerHTML = '<option value="">Application queue unavailable</option>';
      if (preview) preview.innerHTML = `<span class="error-text">${escapeHtml(error.message)}</span>`;
      return [];
    }
  }

  function renderApplicationPreview() {
    const select = $("[data-application-select]");
    const preview = $("[data-application-preview]");
    if (!select || !preview) return;
    let applications = [];
    try { applications = JSON.parse(select.dataset.applications || "[]"); } catch {}
    const candidate = applications.find((item) => item.id === select.value);
    preview.innerHTML = candidate
      ? `<strong>${escapeHtml(`${candidate.first_name || ""} ${candidate.last_name || ""}`.trim())}</strong><span>${escapeHtml(candidate.email || "")} · ${escapeHtml(candidate.role || "Role not selected")}</span><small>Application ${escapeHtml(candidate.reference || candidate.id)} · Submitted ${escapeHtml(formatDate(candidate.application_submitted_at))}</small>`
      : '<span>Select an application to review its reference, role, and submission date.</span>';
  }


  function enforceInvitationSelection() {
    const statusSelect = $("[data-invite-status]");
    const stageSelect = $("[data-invite-stage]");
    if (!statusSelect || !stageSelect) return;
    const applicationMode = $('[name="invitationMode"]:checked')?.value !== "manual";
    const allowed = applicationMode ? ["application_received"] : (invitationStatusRules[statusSelect.value] || invitationStatusRules.invited);
    [...stageSelect.options].forEach((option) => {
      option.disabled = !allowed.includes(option.value);
      option.hidden = !allowed.includes(option.value);
    });
    if (!allowed.includes(stageSelect.value)) stageSelect.value = allowed[0];
    renderInvitationTemplatePreview();
  }

  function renderInvitationTemplatePreview() {
    const status = $("[data-invite-status]")?.value || "invited";
    const stage = $("[data-invite-stage]")?.value || "application_received";
    const preview = $("[data-invite-template-preview]");
    if (!preview) return;
    const stageConfig = invitationStageTemplates[stage] || invitationStageTemplates.application_received;
    const statusLabelText = invitationStatusLabels[status] || "Invited";
    const title = status === "invited" ? stageConfig.title : `${stageConfig.title} — ${statusLabelText}`;
    preview.innerHTML = `<span>${escapeHtml(stageConfig.eyebrow)} · ${escapeHtml(statusLabelText)}</span><strong>${escapeHtml(title)}</strong><p>The exclusive email includes the unchanged candidate ID, a newly generated personal access code, the selected status and stage, expiry, and the correct secure-portal action.</p>`;
  }

  function setInviteMode(mode) {
    const applicationMode = mode !== "manual";
    const applicationFields = $("[data-invite-application-fields]");
    const manualFields = $("[data-invite-manual-fields]");
    if (applicationFields) applicationFields.hidden = !applicationMode;
    if (manualFields) manualFields.hidden = applicationMode;
    const applicationSelect = $("[data-application-select]");
    if (applicationSelect) applicationSelect.required = applicationMode;
    const stageSelect = $("[data-invite-stage]");
    const statusSelect = $("[data-invite-status]");
    if (applicationMode && stageSelect) {
      stageSelect.value = "application_received";
      [...stageSelect.options].forEach((option) => { option.hidden = option.value !== "application_received"; option.disabled = option.value !== "application_received"; });
      if (statusSelect) statusSelect.value = "invited";
    } else {
      enforceInvitationSelection();
    }
    renderInvitationTemplatePreview();
    $$('[data-invite-manual-fields] input, [data-invite-manual-fields] select, [data-invite-manual-fields] textarea').forEach((field) => {
      field.required = !applicationMode && ["firstName", "lastName", "email", "role", "manualInviteReason", "adminOverrideConfirmed"].includes(field.name);
    });
  }

  async function openInviteModal(preselectCandidateId = "") {
    const modal = $("#inviteModal");
    const resultBox = $("[data-invite-result]");
    if (!modal || !resultBox) {
      toast("The invitation interface is unavailable. Hard-refresh after deployment.");
      return;
    }
    resultBox.innerHTML = "";
    const mode = preselectCandidateId ? "application" : ($('[name="invitationMode"]:checked')?.value || "application");
    const radio = $(`[name="invitationMode"][value="${mode}"]`);
    if (radio) radio.checked = true;
    setInviteMode(mode);
    modal.showModal();
    if (mode === "application") await loadEligibleApplications(preselectCandidateId);
  }

  function setupInviteModal() {
    const modal = $("#inviteModal");
    const inviteForm = $("[data-invite-form]");
    if (!modal || !inviteForm) {
      console.warn("Invite modal markup is unavailable; invitation controls were not initialized.");
      return;
    }
    $$('[data-open-invite]').forEach((button) => button.addEventListener("click", () => openInviteModal()));
    $$('[data-close-modal]').forEach((button) => button.addEventListener("click", () => modal.close()));
    $("[data-application-select]")?.addEventListener("change", renderApplicationPreview);
    $("[data-invite-status]")?.addEventListener("change", enforceInvitationSelection);
    $("[data-invite-stage]")?.addEventListener("change", renderInvitationTemplatePreview);
    enforceInvitationSelection();
    $$('[name="invitationMode"]').forEach((radio) => radio.addEventListener("change", async () => {
      setInviteMode(radio.value);
      if (radio.value === "application") await loadEligibleApplications();
    }));
    inviteForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const resultBox = $("[data-invite-result]");
      const submit = form.querySelector('button[type="submit"], input[type="submit"]');
      if (submit) submit.disabled = true;
      const payload = Object.fromEntries(new FormData(form));
      payload.expirationHours = Number(payload.expirationHours);
      payload.adminOverrideConfirmed = payload.adminOverrideConfirmed === "yes";
      resultBox.textContent = payload.invitationMode === "manual" ? "Creating a controlled manual invitation…" : "Creating an application-linked invitation…";
      try {
        const result = await api("/api/admin/candidates", { method: "POST", body: JSON.stringify(payload) });
        const code = result.invitation.accessCode;
        navigator.clipboard?.writeText(code).catch(() => {});
        const origin = result.invitation.journeyOrigin === "admin_manual" ? "Manual administrator invitation" : "Application-linked invitation";
        resultBox.innerHTML = `<div class="access-result"><strong>${escapeHtml(origin)} created for ${escapeHtml(result.candidate.id)}</strong><code>${escapeHtml(code)}</code><span>${escapeHtml(statusLabel(result.invitation.selectedStatus))} · ${escapeHtml(statusLabel(result.invitation.selectedStage))} · ${escapeHtml(result.invitation.templateTitle || "Exclusive invitation template")}</span><span>Expires ${escapeHtml(formatDate(result.invitation.expiresAt))}. Email ${result.invitation.emailSent ? "sent successfully" : "was not delivered"}. The personal code has been copied to your clipboard.</span></div>`;
        form.reset();
        setInviteMode("application");
        enforceInvitationSelection();
        await Promise.all([loadSummary(), loadCandidates()]);
        await loadEligibleApplications();
      } catch (error) {
        resultBox.textContent = error.message;
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }

  function setupNavigation() {
    $$('[data-admin-view]').forEach((button) => button.addEventListener("click", () => setView(button.dataset.adminView)));
    $("[data-jump-candidates]")?.addEventListener("click", () => setView("candidates"));
    $("[data-admin-menu]")?.addEventListener("click", () => $("#adminSidebar")?.classList.toggle("open"));
    $("[data-refresh-candidates]")?.addEventListener("click", () => { candidatePage = 1; loadCandidates(); });
    $("[data-refresh-activity]")?.addEventListener("click", () => { activityPage = 1; loadActivity(); });
    $("[data-activity-search]")?.addEventListener("input", debounce(() => { activityPage = 1; loadActivity(); }, 300));
    $("[data-admin-retry]")?.addEventListener("click", () => location.reload());
    let timer;
    $("[data-candidate-search]")?.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { candidatePage = 1; loadCandidates(); }, 280); });
    $("[data-status-filter]")?.addEventListener("change", () => { candidatePage = 1; loadCandidates(); });
    $("[data-close-drawer]")?.addEventListener("click", closeDrawer);
    $("[data-drawer-overlay]")?.addEventListener("click", closeDrawer);
  }

  function closeDrawer() {
    const drawer = $("[data-candidate-drawer]");
    const overlay = $("[data-drawer-overlay]");
    drawer?.classList.remove("open");
    drawer?.setAttribute("aria-hidden", "true");
    overlay?.classList.remove("open");
  }

  window.BrownstoneAdmin = { api, openCandidate, setView, loadCandidates, loadSummary, toast, can, escapeHtml, formatDate, statusLabel, renderSmartPagination };

  async function init() {
    setupNavigation();
    setupInviteModal();
    try {
      await loadSession();
      await Promise.all([loadSummary(), loadCandidates()]);
    } catch (error) {
      toast(error.message);
      showRuntimeError(error.message, error.incident);
    }
  }

  window.addEventListener("error", (event) => {
    const target = event.target;
    const assetLoadFailed = target instanceof HTMLScriptElement || target instanceof HTMLLinkElement;
    if (assetLoadFailed) {
      showRuntimeError("A dashboard asset failed to load. Hard-refresh after the latest deployment completes.");
    } else {
      toast(event.error?.message || event.message || "A dashboard control encountered an error.");
    }
    console.error("Workforce dashboard runtime error", event.error || event.message);
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    if (reason?.incident) {
      showRuntimeError(reason.message || "A workforce service could not be reached.", reason.incident);
    } else {
      toast(reason?.message || "A dashboard action could not be completed.");
    }
    console.error("Workforce dashboard promise rejection", reason);
  });

  init();
})();
