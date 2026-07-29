(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_PREFIX = "bcPortal:";
  const defaultCandidate = { id: "candidate", name: "Candidate", role: "Candidate onboarding", email: "" };
  const syncTimers = new Map();
  let candidate = { ...defaultCandidate };
  let remoteState = {};
  let databaseConfigured = false;
  let sensitiveStatus = null;

  const taskDefinitions = [
    { id: "profile", title: "Complete your professional profile", description: "Confirm your role pathway, contact information, and goals.", view: "profile" },
    { id: "handbook", title: "Review the employee handbook", description: "Understand Brownstone standards, culture, security, and expectations.", view: "documents" },
    { id: "nda", title: "Review the confidentiality agreement", description: "Read the NDA carefully and prepare any questions before signing.", view: "documents" },
    { id: "identity", title: "Submit secure identity records", description: "Complete encrypted identity details and private document upload when instructed.", view: "secure-identity" },
    { id: "equipment", title: "Confirm remote-work readiness", description: "Check your device, connection, workspace, and security setup.", view: "documents" },
    { id: "academy", title: "Complete Brownstone Academy", description: "Finish all four foundational learning modules.", view: "academy" },
    { id: "assessment", title: "Complete the readiness assessment", description: "Demonstrate your understanding of professional remote work.", view: "assessment" },
    { id: "orientationReady", title: "Prepare for live orientation", description: "Review the session checklist and be ready to join on time.", view: "orientation" },
    { id: "teams", title: "Join the Teams community", description: "Connect through the official Brownstone Careers workforce community.", view: "community" },
  ];

  const journeyStages = [
    ["Application", "Your candidate information was submitted."],
    ["Assessment", "Skills and readiness are reviewed."],
    ["Interview", "Qualifications and expectations are discussed."],
    ["Offer", "A conditional opportunity is presented."],
    ["Verification", "Required details are confirmed securely."],
    ["Onboarding", "Documents, learning, and orientation are completed."],
    ["Training", "Role-specific knowledge and tools are introduced."],
    ["Certification", "Foundational readiness is recognized."],
    ["Teams Community", "You connect with the Brownstone network."],
    ["Live Projects", "You begin practical contribution."],
    ["Career Advancement", "Performance and learning create new opportunities."],
  ];

  const modules = [
    { id: "communication", number: "01", title: "Professional Communication", minutes: 12, text: "Communicate with clarity, context, respect, and appropriate urgency across remote channels." },
    { id: "security", number: "02", title: "Information Security", minutes: 15, text: "Protect candidate, client, company, and personal information through approved security practices." },
    { id: "client", number: "03", title: "Client & Candidate Experience", minutes: 14, text: "Create trust through accuracy, responsiveness, empathy, and reliable follow-through." },
    { id: "remote", number: "04", title: "Remote Work Excellence", minutes: 19, text: "Build the workspace, routines, communication habits, and accountability required for remote success." },
  ];

  function storageKey(name) {
    return `${STORAGE_PREFIX}${candidate.id}:${name}`;
  }

  function localRead(name, fallback) {
    try {
      const raw = localStorage.getItem(storageKey(name));
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function read(name, fallback) {
    return Object.prototype.hasOwnProperty.call(remoteState, name) ? remoteState[name] : localRead(name, fallback);
  }

  function localWrite(name, value) {
    try { localStorage.setItem(storageKey(name), JSON.stringify(value)); } catch {}
  }

  function write(name, value, eventType = "candidate.portal_state_updated") {
    remoteState[name] = value;
    localWrite(name, value);
    scheduleStateSync(name, value, eventType);
  }

  function scheduleStateSync(name, value, eventType) {
    clearTimeout(syncTimers.get(name));
    syncTimers.set(name, setTimeout(async () => {
      try {
        const response = await fetch("/api/portal/state", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ key: name, value, eventType }),
        });
        if (response.status === 401) location.href = "/onboarding_portal/";
      } catch {
        // The browser copy remains available when network synchronization is temporarily unavailable.
      }
    }, 180));
  }

  async function track(eventType, description = "Candidate portal activity.", metadata = {}) {
    try {
      await fetch("/api/portal/activity", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ eventType, description, metadata }),
      });
    } catch {}
  }

  function toast(message) {
    const element = $("[data-toast]");
    if (!element) return;
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 2700);
  }

  function firstName() {
    return (candidate.name || "Candidate").trim().split(/\s+/)[0] || "Candidate";
  }

  function initials() {
    return (candidate.name || "BC").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  }

  async function loadSession() {
    const response = await fetch("/onboarding_portal/session", { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (response.status === 401) {
      location.href = "/onboarding_portal/";
      throw new Error("Candidate session expired.");
    }
    if (response.ok) candidate = { ...defaultCandidate, ...(await response.json()) };

    try {
      const stateResponse = await fetch("/api/portal/state", { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (stateResponse.ok) {
        const data = await stateResponse.json();
        remoteState = data.state || {};
        databaseConfigured = Boolean(data.databaseConfigured);
        for (const [name, value] of Object.entries(remoteState)) localWrite(name, value);
      }
    } catch {}

    $("[data-candidate-name]").textContent = candidate.name;
    $("[data-candidate-role]").textContent = candidate.role;
    $("[data-first-name]").textContent = firstName();
    $("[data-initials]").textContent = initials();
    const hour = new Date().getHours();
    $("[data-greeting]").textContent = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  }

  function getProgress() {
    return read("tasks", {});
  }

  function setTask(id, value = true, eventType = null) {
    const progress = { ...getProgress(), [id]: value };
    write("tasks", progress, eventType || (value ? `candidate.task_completed` : "candidate.task_reopened"));
    renderAll();
    toast(value ? "Progress saved." : "Task reopened.");
    track(value ? "candidate.task_completed" : "candidate.task_reopened", `${value ? "Completed" : "Reopened"} onboarding task: ${id}.`, { taskId: id });
  }

  function isTaskComplete(id) {
    const progress = getProgress();
    if (id === "academy") return modules.every((module) => Boolean(read(`module:${module.id}`, false)));
    return Boolean(progress[id]);
  }

  function completion() {
    const complete = taskDefinitions.filter((task) => isTaskComplete(task.id)).length;
    return { complete, total: taskDefinitions.length, percent: Math.round((complete / taskDefinitions.length) * 100) };
  }

  function showView(name, push = true) {
    const target = $(`[data-view="${name}"]`);
    if (!target) return;
    $$('[data-view]').forEach((view) => view.classList.toggle("active", view === target));
    $$('[data-view-target]').forEach((button) => button.classList.toggle("active", button.dataset.viewTarget === name));
    const labels = {
      dashboard: "Dashboard",
      profile: "My profile",
      journey: "My journey",
      documents: "Documents",
      submissions: "Task submissions",
      "secure-identity": "Secure identity",
      academy: "Brownstone Academy",
      assessment: "Readiness assessment",
      orientation: "Orientation",
      community: "Teams community",
      progress: "Career progress",
      settings: "Settings",
    };
    $("[data-context-title]").textContent = labels[name] || "Portal";
    if (push) history.replaceState(null, "", `#${name}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    closeSidebar();
    track("portal.viewed", `Candidate opened the ${labels[name] || name} section.`, { view: name });
    if (name === "secure-identity") loadSensitiveStatus();
  }

  function renderTasks() {
    const container = $("[data-task-list]");
    container.innerHTML = "";
    taskDefinitions.forEach((task) => {
      const complete = isTaskComplete(task.id);
      const row = document.createElement("article");
      row.className = `task-row${complete ? " complete" : ""}`;
      row.innerHTML = `<button class="task-check" type="button" aria-label="${complete ? "Reopen" : "Complete"} ${task.title}">✓</button><div><h3>${task.title}</h3><p>${task.description}</p></div><button class="task-open" type="button">${complete ? "Review" : "Open"}</button>`;
      $(".task-check", row).addEventListener("click", () => setTask(task.id, !complete));
      $(".task-open", row).addEventListener("click", () => showView(task.view));
      container.append(row);
    });
    const remaining = taskDefinitions.filter((task) => !isTaskComplete(task.id)).length;
    $("[data-task-count]").textContent = remaining ? `${remaining} remaining` : "All complete";
  }

  function renderProgress() {
    const { complete, total, percent } = completion();
    $("[data-progress-ring]").style.setProperty("--progress", percent);
    $("[data-progress-value]").textContent = `${percent}%`;
    $("[data-completed-count]").textContent = complete;
    $("[data-total-count]").textContent = total;
    $("[data-linear-progress]").style.width = `${percent}%`;
    $("[data-career-meter]").style.width = `${percent}%`;
    $("[data-career-percent]").textContent = `${percent}%`;
    $("[data-progress-message]").textContent = percent === 100
      ? "Your foundational onboarding checklist is complete and ready for administrator review."
      : percent >= 60
        ? "Strong progress. Finish the remaining milestones with the same care."
        : "Each completed milestone moves you closer to workforce readiness.";
    const next = taskDefinitions.find((task) => !isTaskComplete(task.id));
    $("[data-next-title]").textContent = next ? next.title : "Onboarding ready for review";
    $("[data-next-description]").textContent = next ? next.description : "Your administrator can now review completion and advance your workforce status.";
    $$('[data-next-action]').forEach((button) => { button.onclick = () => showView(next ? next.view : "progress"); });
  }

  function renderRoadmaps() {
    const percent = completion().percent;
    const currentStage = Math.min(journeyStages.length - 1, Math.floor(percent / 10) + 5);
    const mini = $("[data-mini-roadmap]");
    mini.innerHTML = "";
    journeyStages.slice(3, 8).forEach((stage, index) => {
      const absolute = index + 3;
      const div = document.createElement("div");
      div.className = `mini-step ${absolute < currentStage ? "complete" : absolute === currentStage ? "active" : ""}`;
      div.innerHTML = `<i>${absolute < currentStage ? "✓" : absolute + 1}</i><span>${stage[0]}</span>`;
      mini.append(div);
    });
    const full = $("[data-full-roadmap]");
    full.innerHTML = "";
    journeyStages.forEach((stage, index) => {
      const state = index < 5 ? "complete" : index === currentStage ? "active" : index < currentStage ? "complete" : "";
      const status = state === "complete" ? "Complete" : state === "active" ? "Current stage" : "Upcoming";
      const article = document.createElement("article");
      article.className = `roadmap-stage ${state}`;
      article.innerHTML = `<span class="roadmap-number">${state === "complete" ? "✓" : String(index + 1).padStart(2, "0")}</span><div><h2>${stage[0]}</h2><p>${stage[1]}</p></div><span class="roadmap-status">${status}</span>`;
      full.append(article);
    });
  }

  function renderModules() {
    const container = $("[data-module-grid]");
    container.innerHTML = "";
    let completed = 0;
    let remaining = 0;
    modules.forEach((module) => {
      const done = Boolean(read(`module:${module.id}`, false));
      if (done) completed += 1;
      else remaining += module.minutes;
      const article = document.createElement("article");
      article.className = `module-card${done ? " complete" : ""}`;
      article.innerHTML = `<div class="module-top"><span>${module.number}</span><b>${module.minutes} min</b></div><h2>${module.title}</h2><p>${module.text}</p><div class="module-status"><span>${done ? "Completed" : "Ready to begin"}</span><button type="button">${done ? "Review" : "Start module"}</button></div>`;
      $("button", article).addEventListener("click", () => openModule(module));
      container.append(article);
    });
    $("[data-academy-complete]").textContent = completed;
    $("[data-academy-time]").textContent = remaining;
  }

  function openModule(module) {
    const done = Boolean(read(`module:${module.id}`, false));
    const topics = {
      communication: ["Lead with context and a clear purpose.", "Use respectful, complete sentences.", "Communicate risks before a deadline is missed.", "Close the loop with status and next steps."],
      security: ["Use strong, unique passwords and multi-factor authentication.", "Work only in approved systems and tools.", "Verify unexpected requests for sensitive information.", "Report suspected loss, misuse, or unauthorized access immediately."],
      client: ["Listen carefully before proposing a solution.", "Confirm facts and expectations.", "Communicate with empathy and precision.", "Close the loop so the person knows what happens next."],
      remote: ["Create a secure, organized workspace.", "Plan priorities and protect focused work time.", "Maintain visible progress through clear updates.", "End each day by documenting status and next actions."],
    };
    const modal = document.createElement("dialog");
    modal.className = "portal-modal";
    modal.innerHTML = `<form method="dialog"><div class="modal-head"><div><span class="card-kicker">BROWNSTONE ACADEMY · MODULE ${module.number}</span><h2>${module.title}</h2></div><button value="cancel" aria-label="Close">×</button></div><p>${module.text}</p><div class="principle-list">${topics[module.id].map((topic, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><strong>${topic}</strong></div>`).join("")}</div><div class="modal-actions"><button class="secondary-action" value="cancel">Close</button><button class="primary-action" type="button" data-finish-module>${done ? "Mark for review" : "Complete module"}</button></div></form>`;
    document.body.append(modal);
    modal.showModal();
    $("[data-finish-module]", modal).onclick = () => {
      write(`module:${module.id}`, true, "academy.module_completed");
      const allDone = modules.every((item) => item.id === module.id || Boolean(read(`module:${item.id}`, false)));
      if (allDone) {
        const tasks = { ...getProgress(), academy: true };
        write("tasks", tasks, "candidate.task_completed");
      }
      track("academy.module_completed", `Candidate completed ${module.title}.`, { moduleId: module.id });
      modal.close();
      modal.remove();
      renderAll();
      toast(`${module.title} completed.`);
    };
    modal.addEventListener("close", () => modal.remove(), { once: true });
  }

  function renderBadges() {
    const awards = {
      communication: read("module:communication", false),
      security: read("module:security", false) && isTaskComplete("nda") && isTaskComplete("identity"),
      professionalism: read("module:remote", false) && isTaskComplete("assessment"),
      client: read("module:client", false),
    };
    Object.entries(awards).forEach(([id, earned]) => $(`[data-badge="${id}"]`)?.classList.toggle("earned", Boolean(earned)));
  }

  function renderAll() {
    renderTasks();
    renderProgress();
    renderRoadmaps();
    renderModules();
    renderBadges();
  }

  function setupProfile() {
    const form = $("[data-profile-form]");
    const saved = read("profile", {});
    const merged = { fullName: candidate.name, email: candidate.email, role: candidate.role, ...saved };
    Object.entries(merged).forEach(([name, value]) => { if (form.elements[name]) form.elements[name].value = value || ""; });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      write("profile", data, "candidate.profile_updated");
      candidate.name = data.fullName || candidate.name;
      candidate.role = data.role || candidate.role;
      candidate.email = data.email || candidate.email;
      $("[data-candidate-name]").textContent = candidate.name;
      $("[data-candidate-role]").textContent = candidate.role;
      $("[data-first-name]").textContent = firstName();
      $("[data-initials]").textContent = initials();
      $("[data-profile-state]").textContent = databaseConfigured ? "Synced" : "Saved locally";
      setTask("profile", true, "candidate.profile_updated");
    });
  }

  function setupAssessment() {
    const form = $("[data-assessment-form]");
    const prior = read("assessment", null);
    if (prior) {
      $("[data-assessment-status]").textContent = `Completed · ${prior.score}/5`;
      $("[data-assessment-result]").textContent = prior.message;
      $("[data-assessment-result]").className = `assessment-result ${prior.score >= 4 ? "success" : "warning"}`;
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      let score = 0;
      for (let index = 1; index <= 5; index += 1) score += Number(data.get(`q${index}`) || 0);
      const message = score >= 4
        ? `Excellent. You scored ${score}/5 and demonstrated strong readiness.`
        : `You scored ${score}/5. Review the handbook and Academy modules, then discuss questions with your recruiter.`;
      write("assessment", { score, message }, "assessment.submitted");
      if (score >= 4) setTask("assessment", true, "assessment.passed");
      $("[data-assessment-status]").textContent = `Completed · ${score}/5`;
      const result = $("[data-assessment-result]");
      result.textContent = message;
      result.className = `assessment-result ${score >= 4 ? "success" : "warning"}`;
      track("assessment.submitted", "Candidate submitted the onboarding readiness assessment.", { score, passed: score >= 4 });
      toast("Assessment result saved.");
    });
  }

  function setupEquipment() {
    const modal = $("#equipmentModal");
    const form = $("[data-equipment-form]");
    const saved = read("equipment", {});
    Object.entries(saved).forEach(([name, value]) => { if (form.elements[name]) form.elements[name].checked = Boolean(value); });
    $$('[data-open-modal="equipmentModal"]').forEach((button) => { button.onclick = () => modal.showModal(); });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = {};
      [...form.elements].filter((input) => input.type === "checkbox").forEach((input) => { data[input.name] = input.checked; });
      write("equipment", data, "candidate.equipment_check_updated");
      const ready = Object.values(data).every(Boolean);
      setTask("equipment", ready, "candidate.equipment_check_updated");
      modal.close();
      toast(ready ? "Remote readiness confirmed." : "Readiness checklist saved. Complete every item when available.");
    });
  }

  function setupOrientation() {
    const saved = { ...read("orientationChecks", {}) };
    $$('[data-orientation-check]').forEach((input) => {
      input.checked = Boolean(saved[input.dataset.orientationCheck]);
      input.onchange = () => {
        saved[input.dataset.orientationCheck] = input.checked;
        write("orientationChecks", saved, "orientation.checklist_updated");
        if (Object.values(saved).filter(Boolean).length === 5) setTask("orientationReady", true, "orientation.ready_confirmed");
      };
    });
  }

  function statusLabel(value = "") {
    return String(value).replaceAll("_", " ");
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  }

  function renderSensitiveStatus(data) {
    sensitiveStatus = data;
    const statusBox = $("[data-verification-status]");
    const state = $("[data-sensitive-state]");
    const identity = data?.identity;
    const status = identity?.verification_status || "awaiting_submission";
    statusBox.className = `verification-status ${status}`;
    if (identity) {
      statusBox.innerHTML = `<i></i><div><strong>${statusLabel(status)}</strong><small>${identity.ssn_last4 ? `SSN on file: ***-**-${identity.ssn_last4}` : "SSN not provided"} · Submitted ${formatDate(identity.submitted_at)}</small></div>`;
      state.textContent = statusLabel(status);
      if (["submitted", "approved"].includes(status)) {
        const tasks = { ...getProgress(), identity: true };
        remoteState.tasks = tasks;
        localWrite("tasks", tasks);
      }
    } else {
      statusBox.innerHTML = `<i></i><div><strong>${data?.configured === false ? "Secure service awaiting activation" : "Awaiting submission"}</strong><small>${data?.configured === false ? "Your administrator must configure protected storage before submission." : "Complete the confidential form when instructed."}</small></div>`;
      state.textContent = data?.configured === false ? "Not available" : "Not submitted";
    }
    const list = $("[data-secure-documents]");
    const documents = data?.documents || [];
    list.innerHTML = documents.length
      ? documents.map((document) => `<div class="secure-document-item"><div><strong>${statusLabel(document.category)}</strong><small>${document.filename || "Protected document"} · ${formatDate(document.submitted_at)}</small></div><span>${statusLabel(document.status)}</span></div>`).join("")
      : '<div class="secure-document-item"><div><strong>No protected documents submitted</strong><small>Documents appear here after successful encrypted submission.</small></div></div>';
    renderAll();
  }

  async function loadSensitiveStatus() {
    try {
      const response = await fetch("/api/portal/sensitive", { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (response.status === 401) return (location.href = "/onboarding_portal/");
      const data = await response.json().catch(() => ({}));
      renderSensitiveStatus(data);
    } catch {
      renderSensitiveStatus({ configured: false, documents: [] });
    }
  }

  function setupSensitiveIdentity() {
    const form = $("[data-sensitive-form]");
    if (!form) return;
    $("[data-sensitive-toggle]")?.addEventListener("click", (event) => {
      const input = form.elements.ssn;
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      event.currentTarget.textContent = visible ? "Show" : "Hide";
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const result = $("[data-sensitive-result]");
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      result.className = "sensitive-result";
      result.textContent = "Encrypting sensitive data and transferring documents to private storage…";
      try {
        const response = await fetch("/api/portal/sensitive", { method: "POST", credentials: "same-origin", body: new FormData(form), headers: { Accept: "application/json" } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Secure submission failed.");
        result.className = "sensitive-result success";
        result.textContent = data.maskedSsn ? `Secure submission received. SSN stored as ${data.maskedSsn}; full value will not be displayed.` : "Secure identity submission received. No SSN was included.";
        form.elements.ssn.value = "";
        form.elements.idFront.value = "";
        form.elements.idBack.value = "";
        setTask("identity", true, "identity.secure_submission_completed");
        await loadSensitiveStatus();
      } catch (error) {
        result.className = "sensitive-result error";
        result.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
    loadSensitiveStatus();
  }

  function setupNavigation() {
    $$('[data-view-target]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.viewTarget)));
    $$('[data-view-jump]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.viewJump)));
    $$('[data-complete-task]').forEach((button) => button.addEventListener("click", () => setTask(button.dataset.completeTask, true)));
    const sidebar = $("#portalSidebar");
    const overlay = $("[data-sidebar-overlay]");
    const toggle = $("[data-sidebar-toggle]");
    toggle.onclick = () => {
      const open = sidebar.classList.toggle("open");
      overlay.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };
    overlay.onclick = closeSidebar;
    const initial = location.hash.replace("#", "");
    showView($(`[data-view="${initial}"]`) ? initial : "dashboard", false);

    $$('a[href*="Brownstone_Careers_Unboarding_Handbook"]').forEach((link) => link.addEventListener("click", () => track("document.handbook_opened", "Candidate opened the employee handbook.")));
    $$('a[href*="Brownstone_Careers_Confidentiality_NDA"]').forEach((link) => link.addEventListener("click", () => track("document.nda_opened", "Candidate opened the confidentiality agreement.")));
    $$('a[href*="teams.live.com"]').forEach((link) => link.addEventListener("click", () => {
      setTask("teams", true, "candidate.teams_joined");
      track("candidate.teams_joined", "Candidate opened the official Teams community invitation.");
    }));
  }

  function closeSidebar() {
    $("#portalSidebar").classList.remove("open");
    $("[data-sidebar-overlay]").classList.remove("open");
    $("[data-sidebar-toggle]").setAttribute("aria-expanded", "false");
  }

  function setupPanels() {
    const notifications = $("[data-notification-panel]");
    $("[data-notification-toggle]").onclick = () => { notifications.classList.add("open"); notifications.setAttribute("aria-hidden", "false"); };
    $("[data-notification-close]").onclick = () => { notifications.classList.remove("open"); notifications.setAttribute("aria-hidden", "true"); };
    const guide = $("[data-guide-panel]");
    const launcher = $("[data-guide-launcher]");
    const setGuide = (open) => { guide.classList.toggle("open", open); guide.setAttribute("aria-hidden", String(!open)); launcher.setAttribute("aria-expanded", String(open)); };
    launcher.onclick = () => setGuide(!guide.classList.contains("open"));
    $("[data-guide-close]").onclick = () => setGuide(false);
    // Brownstone Guide message handling is provided by portal-automation.js.
    // Keeping it in a separate module prevents the legacy local-answer handler from
    // overriding the authenticated support API and human-escalation workflow.
  }

  function setupSettings() {
    const theme = localRead("theme", "dark");
    const dark = theme !== "light";
    document.body.classList.toggle("portal-light", !dark);
    $("[data-theme-checkbox]").checked = dark;
    const applyTheme = (isDark) => {
      document.body.classList.toggle("portal-light", !isDark);
      localWrite("theme", isDark ? "dark" : "light");
    };
    $("[data-theme-checkbox]").onchange = (event) => applyTheme(event.target.checked);
    $("[data-theme-toggle]").onclick = () => {
      const isDark = document.body.classList.contains("portal-light");
      applyTheme(isDark);
      $("[data-theme-checkbox]").checked = isDark;
    };
    const reduced = localRead("reducedMotion", false);
    document.body.classList.toggle("reduce-motion", reduced);
    $("[data-motion-checkbox]").checked = reduced;
    $("[data-motion-checkbox]").onchange = (event) => {
      document.body.classList.toggle("reduce-motion", event.target.checked);
      localWrite("reducedMotion", event.target.checked);
    };
    $("[data-reset-progress]").onclick = () => {
      if (confirm("Clear only the local browser copy of profile and progress? Server records and sensitive submissions will remain unchanged.")) {
        Object.keys(localStorage).filter((name) => name.startsWith(`${STORAGE_PREFIX}${candidate.id}:`)).forEach((name) => localStorage.removeItem(name));
        location.reload();
      }
    };
  }

  async function init() {
    try {
      await loadSession();
      setupNavigation();
      setupProfile();
      setupAssessment();
      setupEquipment();
      setupOrientation();
      setupSensitiveIdentity();
      setupPanels();
      setupSettings();
      renderAll();
    } catch (error) {
      console.error(error);
    }
  }

  init();
})();
