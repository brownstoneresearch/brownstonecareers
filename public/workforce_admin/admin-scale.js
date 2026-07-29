(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const admin = () => window.BrownstoneAdmin;
  let rankings = [];
  let questionSets = [];
  let assignments = [];
  let selectedAssignmentId = "";
  let notificationInitialized = false;
  let notificationServerTime = "";
  let audioContext = null;

  const tonePatterns = {
    application: [[523.25, .12], [659.25, .14]],
    pre_screening: [[659.25, .11], [783.99, .11], [987.77, .16]],
    assessment: [[783.99, .12], [880, .12], [1046.5, .18]],
    interview: [[440, .1], [659.25, .12], [880, .18]],
    offer: [[523.25, .1], [783.99, .12], [1046.5, .22]],
    verification: [[698.46, .11], [587.33, .11], [698.46, .2]],
    onboarding: [[493.88, .1], [739.99, .12], [987.77, .2]],
    orientation: [[587.33, .1], [880, .12], [1174.66, .22]],
    active_worker: [[659.25, .1], [987.77, .12], [1318.51, .24]],
    general: [[523.25, .14]],
  };

  function escapeHtml(value = "") { return admin()?.escapeHtml?.(value) ?? String(value); }
  function formatDate(value) { return admin()?.formatDate?.(value) ?? String(value || ""); }
  function statusLabel(value) { return admin()?.statusLabel?.(value) ?? String(value || "").replaceAll("_", " "); }

  async function api(url, options = {}) { return admin().api(url, options); }

  async function playTone(toneKey = "general") {
    if (!$("[data-admin-tone-enabled]")?.checked) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioContext ||= new AudioContextClass();
      if (audioContext.state === "suspended") await audioContext.resume();
      let start = audioContext.currentTime + .02;
      for (const [frequency, duration] of tonePatterns[toneKey] || tonePatterns.general) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(.09, start + .015);
        gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + .02);
        start += duration + .045;
      }
    } catch {}
  }

  function renderNotifications(items, unreadCount) {
    const list = $("[data-admin-notification-list]");
    const count = $("[data-admin-notification-count]");
    if (count) { count.textContent = String(unreadCount || 0); count.hidden = !unreadCount; }
    if (!list) return;
    list.innerHTML = items.length ? items.map((item) => `<button type="button" class="admin-notification-item ${escapeHtml(item.tone_key)}" data-notification-id="${escapeHtml(item.id)}" data-notification-url="${escapeHtml(item.action_url || "")}"><i></i><div><span>${escapeHtml(statusLabel(item.stage_key || item.notification_type))}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p><small>${escapeHtml(formatDate(item.created_at))}</small></div></button>`).join("") : '<div class="empty-state">No unread administrator notifications.</div>';
    $$('[data-notification-id]', list).forEach((button) => button.addEventListener("click", async () => {
      await api("/api/admin/notifications", { method: "POST", body: JSON.stringify({ action: "mark-read", id: button.dataset.notificationId }) });
      const url = button.dataset.notificationUrl || "";
      if (url.includes("candidate=")) {
        const id = decodeURIComponent(url.split("candidate=")[1].split("&")[0]);
        admin().setView("candidates");
        admin().openCandidate(id);
      } else if (url.includes("prescreen=")) {
        const id = decodeURIComponent(url.split("prescreen=")[1].split("&")[0]);
        admin().setView("prescreen");
        await loadPrescreenQueue();
        openPrescreenReview(id);
      }
      await loadNotifications(false);
    }));
  }

  async function loadNotifications(playNew = true) {
    try {
      const params = new URLSearchParams({ status: "unread" });
      if (notificationServerTime) params.set("since", notificationServerTime);
      const data = await api(`/api/admin/notifications?${params}`);
      if (notificationInitialized && playNew && data.notifications?.length) {
        const ordered = [...data.notifications].reverse();
        for (const item of ordered.slice(-4)) await playTone(item.tone_key);
      }
      notificationInitialized = true;
      notificationServerTime = data.serverTime || notificationServerTime;
      const all = notificationServerTime
        ? await api("/api/admin/notifications?status=unread")
        : data;
      renderNotifications(all.notifications || [], all.unreadCount || 0);
    } catch (error) { console.warn("Admin notification polling failed", error.message); }
  }

  function stageDots(candidate, stages) {
    return stages.filter((stage) => stage.key !== "active_worker").map((stage) => {
      const row = candidate.stages?.[stage.key];
      const complete = row?.status === "completed";
      const current = String(candidate.recruitment_stage) === stage.recruitmentStage;
      return `<span class="rank-stage-dot ${complete ? "complete" : current ? "current" : ""}" title="${escapeHtml(stage.label)}: ${complete ? "complete" : current ? "current" : "pending"}">${complete ? "✓" : ""}</span>`;
    }).join("");
  }

  async function loadRankings() {
    const body = $("[data-ranking-table]");
    if (!body) return;
    body.innerHTML = '<tr><td colspan="7"><div class="empty-state">Calculating pipeline rankings…</div></td></tr>';
    try {
      const params = new URLSearchParams({ stage: $("[data-ranking-stage]")?.value || "all", role: $("[data-ranking-role]")?.value || "all" });
      const data = await api(`/api/admin/rankings?${params}`);
      rankings = data.rankings || [];
      const roles = [...new Set(rankings.map((item) => item.role).filter(Boolean))].sort();
      const roleSelect = $("[data-ranking-role]");
      if (roleSelect && roleSelect.options.length <= 1) roleSelect.insertAdjacentHTML("beforeend", roles.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`).join(""));
      body.innerHTML = rankings.length ? rankings.map((candidate) => `<tr><td><span class="rank-number">#${Number(candidate.pipeline_rank || 0)}</span></td><td><strong>${escapeHtml(`${candidate.first_name} ${candidate.last_name}`)}</strong><small>${escapeHtml(candidate.email)} · ${escapeHtml(candidate.id)}</small></td><td>${escapeHtml(candidate.role || "—")}</td><td><span class="status-pill ${escapeHtml(candidate.status)}">${escapeHtml(statusLabel(candidate.recruitment_stage))}</span></td><td><div class="rank-score"><strong>${Number(candidate.pipeline_score || 0).toFixed(1)}%</strong><div class="progress-line"><i style="width:${Math.max(0, Math.min(100, Number(candidate.pipeline_score || 0)))}%"></i></div><small>${Number(candidate.completed_stage_count || 0)}/${Number(candidate.total_ranked_stages || 8)} weighted stages complete${Number(candidate.in_progress_stage_count || 0) ? ` · ${Number(candidate.in_progress_stage_count)} in progress` : ""}${candidate.prescreening_score == null ? " · Pre-screen pending" : ` · Pre-screen ${Number(candidate.prescreening_score).toFixed(1)}%`}</small></div></td><td><div class="rank-stage-dots">${stageDots(candidate, data.stages || [])}</div></td><td><button class="table-action" type="button" data-ranked-candidate="${escapeHtml(candidate.id)}">Open →</button></td></tr>`).join("") : '<tr><td colspan="7"><div class="empty-state">No candidates match these ranking filters.</div></td></tr>';
      $$('[data-ranked-candidate]', body).forEach((button) => button.addEventListener("click", () => { admin().setView("candidates"); admin().openCandidate(button.dataset.rankedCandidate); }));
    } catch (error) { body.innerHTML = `<tr><td colspan="7"><div class="empty-state">${escapeHtml(error.message)}</div></td></tr>`; }
  }

  function assignmentCard(item) {
    return `<article class="prescreen-queue-item ${escapeHtml(item.status)}"><div><span>${escapeHtml(statusLabel(item.status))}</span><h3>${escapeHtml(`${item.first_name} ${item.last_name}`)}</h3><p>${escapeHtml(item.role || "Role pending")} · ${escapeHtml(item.question_set_title)}</p><small>${item.submitted_at ? `Submitted ${escapeHtml(formatDate(item.submitted_at))}` : `Due ${escapeHtml(formatDate(item.due_at))}`}${item.final_score == null ? "" : ` · Final ${Number(item.final_score).toFixed(1)}%`}</small></div><div class="prescreen-card-actions"><span class="rank-number">#${Number(item.pipeline_rank || 0)}</span><button class="secondary-button" type="button" data-prescreen-review="${escapeHtml(item.id)}">${item.status === "reviewed" ? "View result" : "Review"}</button></div></article>`;
  }

  async function loadPrescreenQueue() {
    const queue = $("[data-prescreen-queue]");
    if (!queue) return;
    queue.innerHTML = '<div class="empty-state">Loading pre-screening queue…</div>';
    try {
      const status = $("[data-prescreen-filter]")?.value || "all";
      const data = await api(`/api/admin/prescreen?status=${encodeURIComponent(status)}`);
      assignments = data.assignments || [];
      const counts = { assigned: 0, submitted: 0, ai_scored: 0, reviewed: 0 };
      for (const item of assignments) {
        if (["assigned", "in_progress"].includes(item.status)) counts.assigned += 1;
        else if (counts[item.status] != null) counts[item.status] += 1;
      }
      Object.entries(counts).forEach(([key, value]) => { const node = $(`[data-prescreen-count="${key}"]`); if (node) node.textContent = value; });
      queue.innerHTML = assignments.length ? assignments.map(assignmentCard).join("") : '<div class="empty-state">No pre-screening assignments match this filter.</div>';
      $$('[data-prescreen-review]', queue).forEach((button) => button.addEventListener("click", () => openPrescreenReview(button.dataset.prescreenReview)));
    } catch (error) { queue.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
  }

  function answerReviewRows(questions = []) {
    return questions.map((question, index) => `<article class="prescreen-answer-review"><div><span>QUESTION ${index + 1} · ${Number(question.max_points || 0)} POINTS</span><h3>${escapeHtml(question.prompt)}</h3><p>${escapeHtml(question.answer_text || "No answer submitted")}</p></div><div class="grading-evidence"><strong>Rubric</strong><p>${escapeHtml(question.rubric)}</p>${question.ai_score == null ? "" : `<strong>AI advisory: ${Number(question.ai_score).toFixed(1)} / ${Number(question.max_points).toFixed(1)}</strong><p>${escapeHtml(question.ai_feedback || "")}</p>`}</div></article>`).join("");
  }

  function renderAiAdvisory(assignment, questions) {
    const panel = $("[data-ai-advisory]");
    if (!panel) return;
    if (assignment.ai_score == null) {
      panel.innerHTML = '<strong>AI advisory draft not generated</strong><p>Generate a rubric-based draft after checking the candidate’s answers. The administrator remains responsible for the final result.</p>';
      return;
    }
    panel.innerHTML = `<span>ADVISORY ONLY · ${escapeHtml(assignment.ai_model || "OpenAI")}</span><strong>Draft score: ${Number(assignment.ai_score).toFixed(1)} / 100</strong><p>${escapeHtml(assignment.ai_summary || "No summary returned.")}</p>${assignment.aiRiskFlags?.length ? `<ul>${assignment.aiRiskFlags.map((flag) => `<li>${escapeHtml(flag)}</li>`).join("")}</ul>` : ""}<small>Do not release this draft without independent human review.</small>`;
  }

  async function openPrescreenReview(id) {
    selectedAssignmentId = id;
    const modal = $("#prescreenReviewModal");
    const detailBox = $("[data-prescreen-review-detail]");
    detailBox.innerHTML = '<div class="empty-state">Loading answers and rubric…</div>';
    $("[data-prescreen-review-result]").textContent = "";
    if (!modal.open) modal.showModal();
    try {
      const data = await api(`/api/admin/prescreen?mode=detail&id=${encodeURIComponent(id)}`);
      const assignment = data.assignment;
      $("[data-prescreen-review-title]").textContent = `${assignment.first_name} ${assignment.last_name}`;
      detailBox.innerHTML = `<div class="review-candidate"><strong>${escapeHtml(`${assignment.first_name} ${assignment.last_name}`)}</strong><span>${escapeHtml(assignment.email)} · ${escapeHtml(assignment.role)}</span><small>${escapeHtml(assignment.question_set_title)} · ${escapeHtml(statusLabel(assignment.status))}</small></div>${answerReviewRows(data.questions)}`;
      renderAiAdvisory(assignment, data.questions);
      const form = $("[data-prescreen-review-form]");
      form.elements.finalScore.value = assignment.final_score ?? "";
      form.elements.finalScore.placeholder = assignment.ai_score == null ? "Administrator score" : `Enter your score independently (AI draft: ${Number(assignment.ai_score).toFixed(1)})`;
      form.elements.resultStatus.value = assignment.result_status && assignment.result_status !== "pending" ? assignment.result_status : "passed";
      form.elements.adminFeedback.value = assignment.admin_feedback || "";
      form.elements.humanReviewConfirmed.checked = false;
      const finalized = assignment.status === "reviewed";
      form.querySelector('[type="submit"]').disabled = finalized;
      $("[data-generate-ai-grade]").disabled = finalized;
      if (finalized) $("[data-prescreen-review-result]").textContent = `Result finalized ${formatDate(assignment.reviewed_at)}.`;
    } catch (error) { detailBox.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
  }

  async function generateAiGrade() {
    if (!selectedAssignmentId) return;
    const button = $("[data-generate-ai-grade]");
    const result = $("[data-prescreen-review-result]");
    button.disabled = true;
    result.textContent = "Generating an advisory rubric-based draft…";
    try {
      const data = await api("/api/admin/prescreen", { method: "POST", body: JSON.stringify({ action: "ai-grade", assignmentId: selectedAssignmentId }) });
      result.textContent = "AI advisory draft generated. Review every answer before finalizing.";
      await openPrescreenReview(selectedAssignmentId);
    } catch (error) { result.textContent = error.message; }
    finally { button.disabled = false; }
  }

  async function finalizePrescreen(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const result = $("[data-prescreen-review-result]");
    result.textContent = "Finalizing the human-reviewed result and sending candidate notifications…";
    try {
      const data = await api("/api/admin/prescreen", { method: "POST", body: JSON.stringify({ action: "finalize", assignmentId: selectedAssignmentId, finalScore: Number(values.finalScore), resultStatus: values.resultStatus, adminFeedback: values.adminFeedback, humanReviewConfirmed: values.humanReviewConfirmed === "yes" }) });
      result.textContent = `Result finalized. Email ${data.emailSent ? "sent" : "delivery needs attention"}.`;
      await Promise.all([loadPrescreenQueue(), loadRankings(), loadNotifications(false)]);
      setTimeout(() => $("#prescreenReviewModal").close(), 900);
    } catch (error) { result.textContent = error.message; }
  }

  async function openAssignment() {
    const modal = $("#prescreenAssignmentModal");
    $("[data-prescreen-assignment-result]").textContent = "";
    modal.showModal();
    try {
      const [candidateData, setData] = await Promise.all([api("/api/admin/candidates?status=all&limit=250"), api("/api/admin/prescreen?mode=sets")]);
      $("[data-prescreen-candidate-select]").innerHTML = '<option value="">Select candidate</option>' + (candidateData.candidates || []).map((candidate) => `<option value="${escapeHtml(candidate.id)}">${escapeHtml(`${candidate.first_name} ${candidate.last_name}`)} — ${escapeHtml(candidate.role || candidate.email)}</option>`).join("");
      const published = (setData.sets || []).filter((set) => set.status === "published");
      $("[data-prescreen-set-select]").innerHTML = '<option value="">Select published question set</option>' + published.map((set) => `<option value="${escapeHtml(set.id)}">${escapeHtml(set.title)} — ${Number(set.question_count || 0)} questions</option>`).join("");
      $("[data-prescreen-assignment-form]").elements.dueAt.value = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    } catch (error) { $("[data-prescreen-assignment-result]").textContent = error.message; }
  }

  async function assignPrescreen(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const result = $("[data-prescreen-assignment-result]");
    result.textContent = "Assigning questions and notifying candidate…";
    try {
      const data = await api("/api/admin/prescreen", { method: "POST", body: JSON.stringify({ action: "assign", ...values, dueAt: new Date(`${values.dueAt}T23:59:59Z`).toISOString() }) });
      result.textContent = `Pre-screening assigned. Email ${data.emailSent ? "sent" : "delivery needs attention"}.`;
      await loadPrescreenQueue();
      setTimeout(() => $("#prescreenAssignmentModal").close(), 800);
    } catch (error) { result.textContent = error.message; }
  }

  function setCard(set) {
    return `<button type="button" class="prescreen-set-card ${escapeHtml(set.status)}" data-prescreen-set="${escapeHtml(set.id)}"><span>${escapeHtml(statusLabel(set.status))}</span><strong>${escapeHtml(set.title)}</strong><small>${Number(set.question_count || 0)} questions · ${Number(set.total_points || 0)} points · pass ${Number(set.pass_score || 70)}%</small></button>`;
  }

  async function loadQuestionSets(selectId = "") {
    const list = $("[data-prescreen-set-list]");
    list.innerHTML = '<div class="empty-state">Loading question sets…</div>';
    const data = await api("/api/admin/prescreen?mode=sets");
    questionSets = data.sets || [];
    list.innerHTML = `<button class="primary-button compact-button" type="button" data-create-prescreen-set>＋ New set</button>${questionSets.map(setCard).join("")}`;
    $("[data-create-prescreen-set]").onclick = createQuestionSet;
    $$('[data-prescreen-set]', list).forEach((button) => button.addEventListener("click", () => loadQuestions(button.dataset.prescreenSet)));
    if (selectId) await loadQuestions(selectId); else if (questionSets[0]) await loadQuestions(questionSets[0].id);
  }

  async function createQuestionSet() {
    const title = prompt("Question-set title:");
    if (!title) return;
    const data = await api("/api/admin/prescreen", { method: "POST", body: JSON.stringify({ action: "create-set", title, description: "Administrator-managed Brownstone Careers pre-screening.", passScore: 70 }) });
    await loadQuestionSets(data.setId);
  }

  function questionEditor(question) {
    return `<form class="prescreen-question-editor" data-question-editor="${escapeHtml(question.id)}"><input type="hidden" name="questionId" value="${escapeHtml(question.id)}"><label>Question<textarea name="prompt" rows="3" required>${escapeHtml(question.prompt)}</textarea></label><div class="form-grid"><label>Type<select name="questionType"><option value="textarea"${question.question_type === "textarea" ? " selected" : ""}>Long answer</option><option value="short_text"${question.question_type === "short_text" ? " selected" : ""}>Short answer</option><option value="yes_no"${question.question_type === "yes_no" ? " selected" : ""}>Yes / No</option></select></label><label>Points<input name="maxPoints" type="number" min="1" max="100" value="${Number(question.max_points || 10)}"></label><label>Order<input name="sortOrder" type="number" value="${Number(question.sort_order || 100)}"></label><label>Status<select name="status"><option value="active"${question.status === "active" ? " selected" : ""}>Active</option><option value="inactive"${question.status === "inactive" ? " selected" : ""}>Inactive</option></select></label></div><label>Scoring rubric<textarea name="rubric" rows="4" required>${escapeHtml(question.rubric)}</textarea></label><label>AI guidance<textarea name="aiGuidance" rows="2">${escapeHtml(question.ai_guidance || "")}</textarea></label><label class="override-confirm"><input name="required" type="checkbox" value="yes"${question.required ? " checked" : ""}><span>Required question</span></label><button class="secondary-button" type="submit">Save question</button></form>`;
  }

  async function loadQuestions(setId) {
    const panel = $("[data-prescreen-question-manager]");
    panel.innerHTML = '<div class="empty-state">Loading questions…</div>';
    const data = await api(`/api/admin/prescreen?mode=questions&setId=${encodeURIComponent(setId)}`);
    const set = data.set;
    panel.innerHTML = `<form class="prescreen-set-editor" data-prescreen-set-editor><input type="hidden" name="setId" value="${escapeHtml(set.id)}"><div class="form-grid"><label class="full">Title<input name="title" value="${escapeHtml(set.title)}" required></label><label>Pass score<input name="passScore" type="number" min="0" max="100" value="${Number(set.pass_score || 70)}"></label><label>Status<select name="status"><option value="draft"${set.status === "draft" ? " selected" : ""}>Draft</option><option value="published"${set.status === "published" ? " selected" : ""}>Published</option><option value="archived"${set.status === "archived" ? " selected" : ""}>Archived</option></select></label><label class="full">Description<textarea name="description" rows="2">${escapeHtml(set.description || "")}</textarea></label><label class="full">Candidate instructions<textarea name="instructions" rows="3">${escapeHtml(set.instructions || "")}</textarea></label></div><button class="primary-button" type="submit">Save question set</button></form><div class="prescreen-question-editors">${(data.questions || []).map(questionEditor).join("")}</div><form class="prescreen-question-editor add-question" data-add-question><h3>Add question</h3><label>Question<textarea name="prompt" rows="3" required></textarea></label><label>Scoring rubric<textarea name="rubric" rows="4" required></textarea></label><div class="form-grid"><label>Type<select name="questionType"><option value="textarea">Long answer</option><option value="short_text">Short answer</option><option value="yes_no">Yes / No</option></select></label><label>Points<input name="maxPoints" type="number" min="1" max="100" value="10"></label><label>Order<input name="sortOrder" type="number" value="100"></label></div><button class="primary-button" type="submit">Add question</button></form>`;
    $("[data-prescreen-set-editor]").onsubmit = async (event) => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
      await api("/api/admin/prescreen", { method: "POST", body: JSON.stringify({ action: "update-set", ...values, passScore: Number(values.passScore) }) });
      admin().toast("Question set updated."); await loadQuestionSets(setId);
    };
    $$('[data-question-editor]', panel).forEach((form) => form.addEventListener("submit", async (event) => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(form));
      await api("/api/admin/prescreen", { method: "POST", body: JSON.stringify({ action: "update-question", ...values, maxPoints: Number(values.maxPoints), sortOrder: Number(values.sortOrder), required: values.required === "yes" }) });
      admin().toast("Question updated."); await loadQuestions(setId);
    }));
    $("[data-add-question]").onsubmit = async (event) => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
      await api("/api/admin/prescreen", { method: "POST", body: JSON.stringify({ action: "add-question", setId, ...values, maxPoints: Number(values.maxPoints), sortOrder: Number(values.sortOrder) }) });
      admin().toast("Question added."); await loadQuestionSets(setId);
    };
  }

  async function openManager() {
    $("#prescreenManagerModal").showModal();
    try { await loadQuestionSets(); } catch (error) { $("[data-prescreen-question-manager]").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
  }

  function setup() {
    document.addEventListener("click", () => { const AudioContextClass = window.AudioContext || window.webkitAudioContext; if (!audioContext && AudioContextClass) audioContext = new AudioContextClass(); }, { once: true });
    $$('[data-admin-view]').forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.adminView === "rankings") loadRankings();
      if (button.dataset.adminView === "prescreen") loadPrescreenQueue();
    }));
    $("[data-refresh-rankings]")?.addEventListener("click", loadRankings);
    $("[data-ranking-stage]")?.addEventListener("change", loadRankings);
    $("[data-ranking-role]")?.addEventListener("change", loadRankings);
    $("[data-refresh-prescreen]")?.addEventListener("click", loadPrescreenQueue);
    $("[data-prescreen-filter]")?.addEventListener("change", loadPrescreenQueue);
    $("[data-assign-prescreen]")?.addEventListener("click", openAssignment);
    $("[data-manage-prescreen]")?.addEventListener("click", openManager);
    $$('[data-close-prescreen-assignment]').forEach((button) => button.addEventListener("click", () => $("#prescreenAssignmentModal").close()));
    $$('[data-close-prescreen-manager]').forEach((button) => button.addEventListener("click", () => $("#prescreenManagerModal").close()));
    $$('[data-close-prescreen-review]').forEach((button) => button.addEventListener("click", () => $("#prescreenReviewModal").close()));
    $("[data-prescreen-assignment-form]")?.addEventListener("submit", assignPrescreen);
    $("[data-prescreen-review-form]")?.addEventListener("submit", finalizePrescreen);
    $("[data-generate-ai-grade]")?.addEventListener("click", generateAiGrade);
    $("[data-admin-notification-toggle]")?.addEventListener("click", () => { const panel = $("[data-admin-notification-panel]"); panel.classList.add("open"); panel.setAttribute("aria-hidden", "false"); loadNotifications(false); });
    $("[data-admin-notification-close]")?.addEventListener("click", () => { const panel = $("[data-admin-notification-panel]"); panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); });
    $("[data-admin-notification-read-all]")?.addEventListener("click", async () => { await api("/api/admin/notifications", { method: "POST", body: JSON.stringify({ action: "mark-all-read" }) }); await loadNotifications(false); });
    loadNotifications(false);
    setInterval(() => loadNotifications(true), 30000);
    const hash = location.hash;
    if (hash.startsWith("#candidate=")) { admin().setView("candidates"); admin().openCandidate(decodeURIComponent(hash.slice(11))); }
    if (hash.startsWith("#prescreen=")) { admin().setView("prescreen"); loadPrescreenQueue().then(() => openPrescreenReview(decodeURIComponent(hash.slice(11)))); }
  }

  window.addEventListener("DOMContentLoaded", setup);
})();
