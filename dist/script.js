const toggle = document.querySelector(".cover-menu-toggle");
const nav = document.querySelector(".cover-main-nav");

toggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(open));
});

document.querySelectorAll(".cover-main-nav a").forEach((link) => {
  link.addEventListener("click", () => nav?.classList.remove("open"));
});

const page = document.body.dataset.page;
document.querySelectorAll("[data-nav]").forEach((link) => {
  if (link.dataset.nav === page) link.classList.add("active");
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
