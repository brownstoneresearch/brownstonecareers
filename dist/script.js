const toggle = document.querySelector(".cover-menu-toggle");
const nav = document.querySelector(".cover-main-nav");
const backdrop = document.querySelector(".mobile-nav-backdrop");

toggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  document.body.classList.toggle("menu-open", open);
  backdrop?.setAttribute("aria-hidden", String(!open));
});

document.querySelectorAll(".cover-main-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    nav?.classList.remove("open");
    toggle?.setAttribute("aria-expanded", "false");
    toggle?.setAttribute("aria-label", "Open navigation");
    document.body.classList.remove("menu-open");
    backdrop?.setAttribute("aria-hidden", "true");
  });
});


backdrop?.addEventListener("click", () => {
  nav?.classList.remove("open");
  toggle?.setAttribute("aria-expanded", "false");
  toggle?.setAttribute("aria-label", "Open navigation");
  document.body.classList.remove("menu-open");
  backdrop.setAttribute("aria-hidden", "true");
});

const page = document.body.dataset.page;
document.querySelectorAll("[data-nav]").forEach((link) => {
  if (link.dataset.nav === page) { link.classList.add("active"); link.setAttribute("aria-current", "page"); }
});

const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();

const params = new URLSearchParams(location.search);
const selectedRole = params.get("role");
const roleSelect = document.getElementById("roleSelect");
if (selectedRole && roleSelect) roleSelect.value = selectedRole;

function setFormState(form, message, type = "") {
  const status = form.querySelector(".form-status");
  if (!status) return;
  status.textContent = message;
  status.className = `form-status${type ? ` ${type}` : ""}`;
}

async function submitForm(form, endpoint) {
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const resume = form.querySelector('input[name="resume"]')?.files?.[0];
  if (resume && resume.size > 5 * 1024 * 1024) {
    setFormState(form, "Your resume must be no larger than 5 MB.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "Sending…";
  setFormState(form, "Securely submitting your information…", "pending");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" }
    });

    let result = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      throw new Error(result.message || "Your submission could not be sent.");
    }

    form.reset();
    const message = result.reference
      ? `Submission received successfully. Your reference is ${result.reference}. Please check your email for confirmation.`
      : "Your message was sent successfully. Please check your email for confirmation.";

    setFormState(form, message, "success");
  } catch (error) {
    setFormState(
      form,
      error.message || "A connection error occurred. Please try again.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

document.getElementById("careerApplicationForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  submitForm(event.currentTarget, "/api/applications");
});

document.getElementById("supportForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  submitForm(event.currentTarget, "/api/contact");
});

const observer = new IntersectionObserver(
  (entries) =>
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    }),
  { threshold: 0.1 }
);

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));


// Close mobile navigation when clicking outside or pressing Escape.
document.addEventListener("click", (event) => {
  if (!nav?.classList.contains("open")) return;
  if (!nav.contains(event.target) && !toggle?.contains(event.target)) {
    nav.classList.remove("open");
    toggle?.setAttribute("aria-expanded", "false");
    toggle?.setAttribute("aria-label", "Open navigation");
    document.body.classList.remove("menu-open");
    backdrop?.setAttribute("aria-hidden", "true");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && nav?.classList.contains("open")) {
    nav.classList.remove("open");
    toggle?.setAttribute("aria-expanded", "false");
    toggle?.setAttribute("aria-label", "Open navigation");
    document.body.classList.remove("menu-open");
    backdrop?.setAttribute("aria-hidden", "true");
    toggle?.focus();
  }
});
