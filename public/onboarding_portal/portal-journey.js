(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let journey = null;
  let notificationPage = 1;
  const pageSize = 6;

  const viewStages = Object.freeze({
    submissions: "application",
    "pre-screening": "pre_screening",
    assessment: "assessment",
    "secure-identity": "verification",
    profile: "onboarding",
    documents: "onboarding",
    academy: "onboarding",
    community: "onboarding",
    orientation: "orientation",
  });

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) location.href = "/onboarding_portal/";
    if (!response.ok) throw new Error(data.message || `Journey request failed with status ${response.status}.`);
    return data;
  }

  function portalToast(message) {
    if (window.BrownstonePortal?.toast) return window.BrownstonePortal.toast(message);
    const node = $("[data-toast]");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(portalToast.timer);
    portalToast.timer = setTimeout(() => node.classList.remove("show"), 3000);
  }

  function openView(view) {
    if (view === "submissions" && journey?.directive?.candidateTaskId) {
      window.dispatchEvent(new CustomEvent("brownstone:open-task", { detail: { candidateTaskId: journey.directive.candidateTaskId } }));
    }
    if (window.BrownstonePortal?.showView) window.BrownstonePortal.showView(view);
    else $(`[data-view-target="${CSS.escape(view)}"]`)?.click();
  }

  function canOpen(view) {
    if (!journey || !viewStages[view]) return true;
    const stage = journey.stages?.find((item) => item.key === viewStages[view]);
    return Boolean(stage && ["completed", "current"].includes(stage.access));
  }

  function blocked(view) {
    const stage = journey?.stages?.find((item) => item.key === viewStages[view]);
    const current = journey?.currentStage;
    portalToast(stage?.access === "locked"
      ? `${stage.label} is locked. Complete ${current?.label || "the current stage"} first.`
      : "This stage is not available yet.");
  }

  function directiveIcon(type) {
    return ({ action: "→", correction: "!", waiting: "◷", complete: "✓", closed: "×", paused: "Ⅱ" })[type] || "→";
  }

  function renderDirective() {
    const directive = journey?.directive;
    const card = $("[data-journey-command]");
    if (!card || !directive) return;
    card.className = `journey-command-center ${directive.type || "waiting"}`;
    $("[data-journey-directive-icon]", card).textContent = directiveIcon(directive.type);
    $("[data-journey-stage-label]", card).textContent = `${journey.currentStage?.label || "Current stage"} · ${String(directive.type || "waiting").replaceAll("_", " ").toUpperCase()}`;
    $("[data-journey-directive-title]", card).textContent = directive.title;
    $("[data-journey-directive-message]", card).textContent = directive.message;
    const position = Math.max(1, (journey.stages || []).findIndex((stage) => stage.key === journey.currentStage?.key) + 1);
    $("[data-journey-position]", card).textContent = `Stage ${position} of ${journey.totalStages || journey.stages?.length || 9}`;
    $("[data-journey-waiting]", card).textContent = directive.waitingFor ? `Waiting for: ${directive.waitingFor}` : "Your action is required";
    const action = $("[data-journey-directive-action]", card);
    action.textContent = `${directive.actionLabel || "View next step"} →`;
    action.hidden = ["closed", "paused"].includes(directive.type) && !directive.actionView;
    action.onclick = () => openView(directive.actionView || "journey");
  }

  function stageStatusLabel(stage) {
    if (stage.access === "completed") return "Complete";
    if (stage.access === "current") return stage.evidenceReady ? "Ready for review" : "Current stage";
    if (stage.access === "locked") return "Locked";
    return "Pending";
  }

  function stageMarkup(stage, index, compact = false) {
    return `<article class="mature-stage ${escapeHtml(stage.access)}" data-stage-key="${escapeHtml(stage.key)}">
      <div class="mature-stage-number">${stage.access === "completed" ? "✓" : String(index + 1).padStart(2, "0")}</div>
      <div class="mature-stage-copy"><span>${escapeHtml(stageStatusLabel(stage))}</span><strong>${escapeHtml(stage.label)}</strong>${compact ? "" : `<p>${escapeHtml(stage.evidenceReason || "This stage follows the verified sequence.")}</p>`}</div>
      <div class="mature-stage-meter"><i style="width:${Math.max(0, Math.min(100, Number(stage.percent || 0)))}%"></i><small>${Math.round(Number(stage.percent || 0))}%</small></div>
    </article>`;
  }

  function renderStages() {
    const stages = journey?.stages || [];
    const rail = $("[data-journey-stage-rail]");
    const full = $("[data-full-roadmap]");
    if (rail) rail.innerHTML = stages.map((stage, index) => stageMarkup(stage, index, true)).join("");
    if (full) full.innerHTML = stages.map((stage, index) => stageMarkup(stage, index, false)).join("");
    $$('[data-stage-key]', document).forEach((card) => {
      const stage = stages.find((item) => item.key === card.dataset.stageKey);
      if (!stage) return;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `${stage.label}: ${stageStatusLabel(stage)}`);
      const activate = () => stage.access === "locked" ? blocked(stage.view) : openView(stage.view || "journey");
      card.addEventListener("click", activate);
      card.addEventListener("keydown", (event) => {
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); activate(); }
      });
    });
  }

  function renderProgress() {
    const progress = Math.max(0, Math.min(100, Number(journey?.progress || 0)));
    $("[data-progress-ring]")?.style.setProperty("--progress", progress);
    if ($("[data-progress-value]")) $("[data-progress-value]").textContent = `${Math.round(progress)}%`;
    if ($("[data-completed-count]")) $("[data-completed-count]").textContent = journey?.completedCount || 0;
    if ($("[data-total-count]")) $("[data-total-count]").textContent = Math.max(1, (journey?.totalStages || 9) - 1);
    if ($("[data-linear-progress]")) $("[data-linear-progress]").style.width = `${progress}%`;
    if ($("[data-career-meter]")) $("[data-career-meter]").style.width = `${progress}%`;
    if ($("[data-career-percent]")) $("[data-career-percent]").textContent = `${Math.round(progress)}%`;
    if ($("[data-progress-message]")) $("[data-progress-message]").textContent = journey?.directive?.message || "Complete the current stage to unlock the next.";
    const progressBadge = $(".progress-card .status-badge");
    if (progressBadge) progressBadge.textContent = journey?.currentStage?.label || "In progress";
    if ($("[data-next-title]")) $("[data-next-title]").textContent = journey?.directive?.title || "Review your next directive";
    if ($("[data-next-description]")) $("[data-next-description]").textContent = journey?.directive?.message || "Your next official instruction appears here.";
    $$('[data-next-action]').forEach((button) => {
      button.textContent = `${journey?.directive?.actionLabel || "View next step"} →`;
      button.onclick = () => openView(journey?.directive?.actionView || "journey");
    });
  }

  function renderLocks() {
    $$('[data-view-target]').forEach((button) => {
      const view = button.dataset.viewTarget;
      const allowed = canOpen(view);
      button.classList.toggle("stage-locked", !allowed);
      button.setAttribute("aria-disabled", String(!allowed));
      const lock = button.querySelector(".stage-lock-mark");
      if (!allowed && !lock) button.insertAdjacentHTML("beforeend", '<em class="stage-lock-mark" aria-hidden="true">⌁</em>');
      if (allowed) lock?.remove();
    });
  }

  function paginationMarkup(meta, target) {
    if (!meta || meta.totalPages <= 1) return "";
    const start = Math.max(1, meta.page - 2);
    const end = Math.min(meta.totalPages, start + 4);
    const buttons = [];
    buttons.push(`<button type="button" data-${target}-page="${meta.page - 1}" ${meta.page <= 1 ? "disabled" : ""}>←</button>`);
    for (let page = start; page <= end; page += 1) buttons.push(`<button type="button" data-${target}-page="${page}" class="${page === meta.page ? "active" : ""}">${page}</button>`);
    buttons.push(`<button type="button" data-${target}-page="${meta.page + 1}" ${meta.page >= meta.totalPages ? "disabled" : ""}>→</button>`);
    return `<span>${meta.total} update${meta.total === 1 ? "" : "s"}</span><div>${buttons.join("")}</div>`;
  }

  function renderNotifications() {
    const items = journey?.notifications || [];
    const list = $("[data-candidate-notification-list]");
    const pager = $("[data-candidate-notification-pagination]");
    const unread = items.filter((item) => item.status === "unread").length;
    const count = $("[data-notification-toggle] span");
    if (count) { count.textContent = String(unread); count.hidden = unread === 0; }
    if (list) {
      list.innerHTML = items.length ? items.map((item) => `<button type="button" class="candidate-notification ${escapeHtml(item.status)}" data-candidate-notification="${escapeHtml(item.id)}" data-notification-url="${escapeHtml(item.action_url || "")}"><span>${escapeHtml(String(item.notification_type || "update").replaceAll("_", " "))}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.message)}</p><small>${escapeHtml(formatDate(item.created_at))}</small></button>`).join("") : '<div class="notification-empty">No dashboard updates yet.</div>';
      $$('[data-candidate-notification]', list).forEach((button) => button.addEventListener("click", async () => {
        await api("/api/portal/journey", { method: "POST", body: JSON.stringify({ action: "mark-notification-read", id: button.dataset.candidateNotification }) }).catch(() => {});
        const url = button.dataset.notificationUrl;
        if (url?.includes("#")) openView(url.split("#")[1]);
        await load({ page: notificationPage, quiet: true });
      }));
    }
    if (pager) {
      pager.innerHTML = paginationMarkup(journey?.notificationPagination, "notification");
      pager.hidden = !pager.innerHTML;
      $$('[data-notification-page]', pager).forEach((button) => button.addEventListener("click", () => {
        notificationPage = Number(button.dataset.notificationPage || 1);
        load({ page: notificationPage, quiet: true });
      }));
    }
  }

  function render() {
    if (!journey) return;
    renderDirective();
    renderStages();
    renderProgress();
    renderLocks();
    renderNotifications();
    window.BrownstoneJourney.rendered = true;
  }

  async function load({ page = notificationPage, quiet = false } = {}) {
    try {
      journey = await api(`/api/portal/journey?page=${Math.max(1, page)}&pageSize=${pageSize}`);
      notificationPage = journey.notificationPagination?.page || 1;
      render();
      window.dispatchEvent(new CustomEvent("brownstone:journey-loaded", { detail: journey }));
    } catch (error) {
      if (!quiet) portalToast(error.message);
      const card = $("[data-journey-command]");
      if (card) card.classList.add("journey-unavailable");
    }
  }

  window.BrownstoneJourney = {
    rendered: false,
    get data() { return journey; },
    canOpen,
    blocked,
    render,
    refresh: () => load({ page: notificationPage, quiet: true }),
  };

  window.addEventListener("brownstone:journey-refresh", () => load({ page: notificationPage, quiet: true }));
  window.addEventListener("DOMContentLoaded", () => {
    $("[data-notification-read-all]")?.addEventListener("click", async () => {
      await api("/api/portal/journey", { method: "POST", body: JSON.stringify({ action: "mark-all-notifications-read" }) });
      await load({ page: 1, quiet: true });
    });
    load({ page: 1 });
    setInterval(() => load({ page: notificationPage, quiet: true }), 30000);
  });
})();
