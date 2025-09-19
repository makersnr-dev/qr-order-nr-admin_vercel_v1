
/*! admin-auth-toggle-fix.js (non-invasive) */
(function () {
  // Prevent early ReferenceError if other scripts call setAuthUI first
  if (typeof window.setAuthUI !== 'function') {
    window.setAuthUI = function () { /* stub */ };
  }

  // Force .hidden style once (avoid FOUC)
  try {
    if (!document.querySelector('style[data-auth-fix]')) {
      const s = document.createElement('style');
      s.setAttribute('data-auth-fix', '1');
      s.textContent = '.hidden{display:none !important}';
      document.head.appendChild(s);
    }
  } catch (e) {}

  const loginBtn  = document.getElementById('btnLogin');
  const logoutBtn = document.getElementById('btnLogout');

  if (loginBtn)  loginBtn.classList.add('hidden');
  if (logoutBtn) logoutBtn.classList.add('hidden');

  function getToken() {
    try { return localStorage.getItem('adminToken') || ''; }
    catch (_) { return ''; }
  }

  function defineReal() {
    window.setAuthUI = function setAuthUI() {
      const logged = !!getToken();
      if (loginBtn)  loginBtn.classList.toggle('hidden',  logged);
      if (logoutBtn) logoutBtn.classList.toggle('hidden', !logged);
    };
    window.setAuthUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', defineReal, { once: true });
  } else {
    defineReal();
  }

  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = '1';
    logoutBtn.addEventListener('click', () => {
      try { localStorage.removeItem('adminToken'); } catch (_) {}
      window.setAuthUI();
      try { location.href = '/login'; } catch (_) {}
    });
  }

  window.addEventListener('storage', (e) => {
    if (e && e.key === 'adminToken') {
      window.setAuthUI();
    }
  });
})();
