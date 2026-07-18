
const body = document.body;
const toggle = document.querySelector('.menu-toggle');
const drawer = document.querySelector('.mobile-drawer');
const backdrop = document.querySelector('.drawer-backdrop');
function closeMenu(){body.classList.remove('menu-open');toggle?.setAttribute('aria-expanded','false');toggle?.setAttribute('aria-label','Open navigation');drawer?.setAttribute('aria-hidden','true');backdrop?.setAttribute('aria-hidden','true');}
function openMenu(){body.classList.add('menu-open');toggle?.setAttribute('aria-expanded','true');toggle?.setAttribute('aria-label','Close navigation');drawer?.setAttribute('aria-hidden','false');backdrop?.setAttribute('aria-hidden','false');}
toggle?.addEventListener('click',()=> body.classList.contains('menu-open') ? closeMenu() : openMenu());
backdrop?.addEventListener('click', closeMenu);
document.addEventListener('keydown',(e)=>{ if(e.key === 'Escape') closeMenu(); });
document.querySelectorAll('.mobile-drawer a').forEach(a=>a.addEventListener('click', closeMenu));
const year = document.getElementById('year'); if(year) year.textContent = new Date().getFullYear();
const params = new URLSearchParams(location.search);
const selectedRole = params.get('role');
const roleSelect = document.getElementById('roleSelect');
if(selectedRole && roleSelect) roleSelect.value = selectedRole;
const filterButtons = document.querySelectorAll('[data-filter]');
const roleCards = document.querySelectorAll('[data-role-card]');
filterButtons.forEach(btn=>btn.addEventListener('click',()=>{
  const filter = btn.dataset.filter;
  filterButtons.forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  roleCards.forEach(card=>{card.style.display = filter === 'all' || card.dataset.category === filter ? '' : 'none';});
}));
function setFormState(form, message, type = '') { const status = form.querySelector('.form-status'); if (!status) return; status.textContent = message; status.className = `form-status${type ? ` ${type}` : ''}`; }
async function submitForm(form, endpoint) {
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const resume = form.querySelector('input[name="resume"]')?.files?.[0];
  if (resume && resume.size > 5 * 1024 * 1024) { setFormState(form, 'Your resume must be no larger than 5 MB.', 'error'); return; }
  button.disabled = true; button.textContent = 'Sending…'; setFormState(form, 'Securely submitting your information…', 'pending');
  try {
    const response = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
    let result = {}; try { result = await response.json(); } catch { result = {}; }
    if (!response.ok) throw new Error(result.message || 'Your submission could not be sent.');
    form.reset();
    const message = result.reference ? `Submission received successfully. Your reference is ${result.reference}. Please check your email for confirmation.` : 'Your message was sent successfully. Please check your email for confirmation.';
    setFormState(form, message, 'success');
  } catch(error) { setFormState(form, error.message || 'A connection error occurred. Please try again.', 'error'); }
  finally { button.disabled = false; button.textContent = originalText; }
}
document.getElementById('careerApplicationForm')?.addEventListener('submit', (event) => { event.preventDefault(); submitForm(event.currentTarget, '/api/applications'); });
document.getElementById('supportForm')?.addEventListener('submit', (event) => { event.preventDefault(); submitForm(event.currentTarget, '/api/contact'); });
const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries)=> entries.forEach((entry)=>{ if(entry.isIntersecting){ entry.target.classList.add('visible'); observer.unobserve(entry.target); }}), {threshold:.12}) : null;
document.querySelectorAll('.reveal').forEach((el)=> observer ? observer.observe(el) : el.classList.add('visible'));
