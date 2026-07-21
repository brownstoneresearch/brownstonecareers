
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
function resetTurnstile(form) {
  const widget = form.querySelector('.cf-turnstile');
  if (widget && window.turnstile) {
    try { window.turnstile.reset(widget); } catch { /* Cloudflare widget may not be ready yet. */ }
  }
}
async function submitForm(form, endpoint) {
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const turnstileWidget = form.querySelector('.cf-turnstile');
  const turnstileToken = form.querySelector('input[name="cf-turnstile-response"]')?.value;
  if (turnstileWidget && !turnstileToken) {
    setFormState(form, 'Please complete the Cloudflare security check before submitting.', 'error');
    return;
  }
  const resume = form.querySelector('input[name="resume"]')?.files?.[0];
  if (resume && resume.size > 5 * 1024 * 1024) { setFormState(form, 'Your resume must be no larger than 5 MB.', 'error'); return; }
  button.disabled = true; button.textContent = 'Sending…'; setFormState(form, 'Securely submitting your information…', 'pending');
  try {
    const response = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
    let result = {}; try { result = await response.json(); } catch { result = {}; }
    if (!response.ok) throw new Error(result.message || 'Your submission could not be sent.');
    form.reset();
    resetTurnstile(form);
    const message = result.reference ? `Submission received successfully. Your reference is ${result.reference}. Please check your email for confirmation.` : 'Your message was sent successfully. Please check your email for confirmation.';
    setFormState(form, message, 'success');
  } catch(error) {
    resetTurnstile(form);
    setFormState(form, error.message || 'A connection error occurred. Please try again.', 'error');
  }
  finally { button.disabled = false; button.textContent = originalText; }
}
document.getElementById('careerApplicationForm')?.addEventListener('submit', (event) => { event.preventDefault(); submitForm(event.currentTarget, '/api/applications'); });
document.getElementById('supportForm')?.addEventListener('submit', (event) => { event.preventDefault(); submitForm(event.currentTarget, '/api/contact'); });
const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries)=> entries.forEach((entry)=>{ if(entry.isIntersecting){ entry.target.classList.add('visible'); observer.unobserve(entry.target); }}), {threshold:.12}) : null;
document.querySelectorAll('.reveal').forEach((el)=> observer ? observer.observe(el) : el.classList.add('visible'));


// Cookie consent and preferences
(function initCookieConsent(){
  const COOKIE_NAME = 'brownstone_cookie_consent';
  const STORAGE_KEY = 'brownstoneCookieConsent';
  const ONE_YEAR = 60 * 60 * 24 * 365;

  function readPreference(){
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch { return null; }
  }
  function writePreference(value){
    const payload = {
      version: 1,
      date: new Date().toISOString(),
      necessary: true,
      analytics: Boolean(value.analytics),
      marketing: Boolean(value.marketing),
      status: value.status || 'custom'
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    const cookieValue = encodeURIComponent(JSON.stringify(payload));
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_NAME}=${cookieValue}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax${secure}`;
    window.dispatchEvent(new CustomEvent('brownstone:cookies-updated', { detail: payload }));
    return payload;
  }
  function removeBanner(){
    document.querySelector('.cookie-consent')?.remove();
    document.body.classList.remove('cookie-consent-open');
  }
  function createFooterButton(){
    if (document.querySelector('[data-cookie-open]')) return;
    const footerBottom = document.querySelector('.premium-footer-bottom, .footer-bottom');
    if (!footerBottom) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'footer-cookie-link';
    button.dataset.cookieOpen = 'true';
    button.textContent = 'Cookie preferences';
    button.addEventListener('click', () => openBanner(true));
    footerBottom.appendChild(button);
  }
  function openBanner(showSettings = false){
    removeBanner();
    const current = readPreference() || { necessary: true, analytics: false, marketing: false };
    const banner = document.createElement('section');
    banner.className = 'cookie-consent';
    banner.setAttribute('aria-label', 'Cookie preferences');
    banner.innerHTML = `
      <div class="cookie-card" role="dialog" aria-modal="false" aria-labelledby="cookie-title">
        <div class="cookie-main">
          <span class="cookie-badge" aria-hidden="true">BC</span>
          <div>
            <h2 id="cookie-title">Your privacy matters</h2>
            <p>Brownstone Careers uses essential cookies to keep the site secure and remember your cookie choices. Optional cookies help us improve the candidate experience.</p>
          </div>
        </div>
        <div class="cookie-settings" ${showSettings ? '' : 'hidden'}>
          <label><input type="checkbox" checked disabled> <span><strong>Essential</strong><small>Required for site security, forms, and saved preferences.</small></span></label>
          <label><input name="analytics" type="checkbox" ${current.analytics ? 'checked' : ''}> <span><strong>Analytics</strong><small>Helps understand page performance and applicant flow.</small></span></label>
          <label><input name="marketing" type="checkbox" ${current.marketing ? 'checked' : ''}> <span><strong>Marketing</strong><small>Helps improve future recruiting campaigns and content.</small></span></label>
        </div>
        <div class="cookie-actions">
          <button type="button" class="cookie-btn cookie-btn-ghost" data-cookie-action="settings">Manage</button>
          <button type="button" class="cookie-btn cookie-btn-soft" data-cookie-action="necessary">Necessary only</button>
          <button type="button" class="cookie-btn cookie-btn-primary" data-cookie-action="accept">Accept all</button>
          <button type="button" class="cookie-btn cookie-btn-primary" data-cookie-action="save" ${showSettings ? '' : 'hidden'}>Save choices</button>
        </div>
      </div>`;
    document.body.appendChild(banner);
    document.body.classList.add('cookie-consent-open');
    const settings = banner.querySelector('.cookie-settings');
    const saveButton = banner.querySelector('[data-cookie-action="save"]');
    banner.querySelector('[data-cookie-action="settings"]')?.addEventListener('click', () => {
      settings.hidden = false;
      saveButton.hidden = false;
    });
    banner.querySelector('[data-cookie-action="necessary"]')?.addEventListener('click', () => {
      writePreference({ status: 'necessary', analytics: false, marketing: false });
      removeBanner();
    });
    banner.querySelector('[data-cookie-action="accept"]')?.addEventListener('click', () => {
      writePreference({ status: 'accepted', analytics: true, marketing: true });
      removeBanner();
    });
    saveButton?.addEventListener('click', () => {
      writePreference({
        status: 'custom',
        analytics: banner.querySelector('input[name="analytics"]')?.checked,
        marketing: banner.querySelector('input[name="marketing"]')?.checked
      });
      removeBanner();
    });
  }
  createFooterButton();
  if (!readPreference()) {
    window.setTimeout(() => openBanner(false), 900);
  }
})();

// V2 navigation intelligence
const currentPage = (location.pathname.split('/').pop() || 'index.html').replace('.html','');
document.querySelectorAll('[data-nav]').forEach(link => { if(link.dataset.nav === currentPage) link.classList.add('active'); });
const siteHeader=document.querySelector('[data-header]');
const syncHeader=()=>siteHeader?.classList.toggle('is-scrolled',window.scrollY>18);
syncHeader(); window.addEventListener('scroll',syncHeader,{passive:true});
