(() => {
  const html = document.documentElement;
  const body = document.body;
  const toggle = document.querySelector('[data-menu-toggle]');
  const drawer = document.querySelector('[data-mobile-drawer]');
  const panel = drawer?.querySelector('[data-mobile-panel]') || drawer?.querySelector('.agency-mobile-panel');
  const backdrop = document.querySelector('[data-drawer-backdrop]');
  const closeButton = document.querySelector('[data-drawer-close]');
  const desktopQuery = window.matchMedia('(min-width: 941px)');
  let isOpen = false;
  let returnFocus = null;
  let scrollY = 0;

  if (!toggle || !drawer || !backdrop || !panel) return;

  const focusableSelector = [
    'a[href]:not([tabindex="-1"])',
    'button:not([disabled]):not([tabindex="-1"])',
    'input:not([disabled]):not([tabindex="-1"])',
    'select:not([disabled]):not([tabindex="-1"])',
    'textarea:not([disabled]):not([tabindex="-1"])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const focusableItems = () => [...drawer.querySelectorAll(focusableSelector)].filter((element) => {
    const style = window.getComputedStyle(element);
    return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden';
  });

  const lockPage = () => {
    scrollY = window.scrollY || window.pageYOffset;
    html.classList.add('agency-menu-open');
    body.classList.add('agency-menu-open');
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
  };

  const unlockPage = () => {
    html.classList.remove('agency-menu-open');
    body.classList.remove('agency-menu-open');
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    window.scrollTo(0, scrollY);
  };

  const setState = (nextOpen, { restoreFocus = true } = {}) => {
    if (isOpen === nextOpen) return;
    isOpen = nextOpen;

    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    drawer.setAttribute('aria-hidden', String(!isOpen));
    backdrop.setAttribute('aria-hidden', String(!isOpen));
    drawer.dataset.state = isOpen ? 'open' : 'closed';
    backdrop.dataset.state = isOpen ? 'open' : 'closed';
    drawer.inert = !isOpen;

    if (isOpen) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : toggle;
      lockPage();
      panel.scrollTop = 0;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        (closeButton || focusableItems()[0] || drawer).focus({ preventScroll: true });
      }));
      return;
    }

    unlockPage();
    if (restoreFocus && returnFocus instanceof HTMLElement && returnFocus.isConnected) {
      requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
    }
  };

  const openMenu = () => {
    if (!desktopQuery.matches) setState(true);
  };
  const closeMenu = (options) => setState(false, options);

  drawer.inert = true;
  drawer.dataset.state = 'closed';
  backdrop.dataset.state = 'closed';
  drawer.setAttribute('aria-hidden', 'true');
  backdrop.setAttribute('aria-hidden', 'true');
  toggle.setAttribute('aria-expanded', 'false');

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    isOpen ? closeMenu() : openMenu();
  });
  closeButton?.addEventListener('click', () => closeMenu());
  backdrop.addEventListener('click', () => closeMenu());

  drawer.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (link) closeMenu({ restoreFocus: false });
  });

  document.addEventListener('keydown', (event) => {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key !== 'Tab') return;

    const items = focusableItems();
    if (!items.length) {
      event.preventDefault();
      drawer.focus({ preventScroll: true });
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  });

  desktopQuery.addEventListener?.('change', (event) => {
    if (event.matches && isOpen) closeMenu({ restoreFocus: false });
  });

  // Prevent page gestures while keeping the drawer itself fully scrollable and interactive.
  backdrop.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  window.addEventListener('pagehide', () => {
    if (isOpen) closeMenu({ restoreFocus: false });
  });
})();

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
  if (!button) return;
  const originalText = button.textContent;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const turnstileWidget = form.querySelector('.cf-turnstile');
  const turnstileToken = form.querySelector('input[name="cf-turnstile-response"]')?.value;
  if (turnstileWidget && !turnstileToken) {
    setFormState(form, 'Please complete the Cloudflare security check before submitting.', 'error');
    return;
  }
  const uploadFields = [
    ['resume', 'Your resume'], ['idFront', 'The front ID file'], ['idBack', 'The back ID file']
  ];
  for (const [name, label] of uploadFields) {
    const file = form.querySelector(`input[name="${name}"]`)?.files?.[0];
    if (file && file.size > 5 * 1024 * 1024) { setFormState(form, `${label} must be no larger than 5 MB.`, 'error'); return; }
  }
  const ssnLast4 = form.querySelector('input[name="ssnLast4"]')?.value || '';
  if (ssnLast4 && !/^\d{4}$/.test(ssnLast4)) { setFormState(form, 'Enter exactly four digits for the SSN field.', 'error'); return; }

  button.disabled = true;
  button.textContent = 'Sending…';
  form.setAttribute('aria-busy', 'true');
  setFormState(form, 'Securely submitting your information…', 'pending');

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      credentials: 'same-origin'
    });
    const contentType = response.headers.get('content-type') || '';
    let result = {};
    if (contentType.includes('application/json')) {
      result = await response.json().catch(() => ({}));
    } else {
      const text = await response.text().catch(() => '');
      result = { message: text && text.length < 300 ? text : '' };
    }
    if (!response.ok) {
      let message = result.message || `Submission failed with status ${response.status}.`;
      if (response.status === 404 || response.status === 405) {
        message = 'The secure form service is not deployed. Please redeploy the project from the repository root so the functions directory is included.';
      }
      const details = [];
      if (result.incident) details.push(`Reference: ${result.incident}`);
      if (result.stage) details.push(`Stage: ${result.stage}`);
      throw new Error(details.length ? `${message} ${details.join(' · ')}` : message);
    }
    form.reset();
    form.querySelectorAll('[data-file-name]').forEach((output) => { output.textContent = 'No file selected'; output.classList.remove('has-file'); });
    form.querySelectorAll('[data-toggle-sensitive]').forEach((control) => { control.textContent = 'Show'; const input = control.closest('.secure-input-wrap')?.querySelector('input'); if (input) input.type = 'password'; });
    resetTurnstile(form);
    const message = result.reference
      ? `Submission received successfully. Your reference is ${result.reference}. Please check your email for confirmation.`
      : 'Your message was sent successfully. Please check your email for confirmation.';
    setFormState(form, message, 'success');
  } catch(error) {
    resetTurnstile(form);
    const message = error?.name === 'AbortError'
      ? 'The submission took too long. Please check your connection and try again.'
      : (error?.message || 'A connection error occurred. Please try again.');
    setFormState(form, message, 'error');
  } finally {
    window.clearTimeout(timeout);
    button.disabled = false;
    button.textContent = originalText;
    form.removeAttribute('aria-busy');
  }
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
const routePath = location.pathname.replace(/\/+$/, '') || '/';
const currentPage = routePath === '/' ? 'index' : (routePath.split('/').pop() || 'index').replace(/\.html$/, '');
document.querySelectorAll('[data-nav]').forEach(link => { if(link.dataset.nav === currentPage){ link.classList.add('active'); link.setAttribute('aria-current','page'); } });
const siteHeader=document.querySelector('[data-header]');
const syncHeader=()=>siteHeader?.classList.toggle('is-scrolled',window.scrollY>18);
syncHeader(); window.addEventListener('scroll',syncHeader,{passive:true});


// Candidate identity form interactions
for (const input of document.querySelectorAll('.premium-form-shell input[type="file"]')) {
  input.addEventListener('change', () => {
    const output = document.querySelector(`[data-file-name="${input.name}"]`);
    const file = input.files?.[0];
    if (!output) return;
    output.textContent = file ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'No file selected';
    output.classList.toggle('has-file', Boolean(file));
  });
}
document.querySelectorAll('[data-toggle-sensitive]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = button.closest('.secure-input-wrap')?.querySelector('input');
    if (!input) return;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.textContent = reveal ? 'Hide' : 'Show';
  });
});
