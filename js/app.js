// ============================================================
// KLAVE — App Router, Bootstrap, Splash Screen & Global Events
// ============================================================

function navTo(s) {
  document.querySelectorAll('.screen').forEach(x => x.classList.remove('active'));
  const target = document.getElementById('s-' + s);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('on'));
  const ni = document.getElementById('ni-' + s);
  if (ni) ni.classList.add('on');

  if (s === 'profile') {
    loadProfile();
    loadAnalyticsProducer();
    loadBankListIntoDropdown();
    prefillBankDetails();
    if (isAdmin()) switchAnalytics('admin', document.querySelector('.at-btn'));
    if (window._currentUser) {
      const emailEl = document.getElementById('settings-current-email');
      if (emailEl) emailEl.textContent = window._currentUser.email;
      const pwLabel = document.getElementById('password-row-label');
      const pwSub = document.getElementById('password-row-sub');
      if (isGoogleOnlyUser()) {
        if (pwLabel) pwLabel.textContent = 'Set Password';
        if (pwSub) pwSub.textContent = 'Add a password to log in without Google';
      } else {
        if (pwLabel) pwLabel.textContent = 'Change Password';
        if (pwSub) pwSub.textContent = 'Update your account password';
      }
    }
  }
  if (s === 'search') renderSearch();
  if (s === 'upload') refreshUploadTierUI();
  if (s === 'plans') loadPlansScreen();
  closeGate();
}

function gated(s) {
  if (window._currentUser && s) navTo(s);
  else document.getElementById('gate').classList.add('on');
}

function producerOnly(s) {
  if (!window._currentUser) {
    document.getElementById('gate').classList.add('on');
    return;
  }
  if (window._myRole === 'producer') navTo(s);
  else toast('Upload is for producer accounts.');
}

function adminOnly(s) {
  if (isAdmin(window._currentUser)) navTo(s);
  else if (window._currentUser) toast('Admin access only');
  else document.getElementById('gate').classList.add('on');
}

function closeGate() {
  document.getElementById('gate').classList.remove('on');
}

function toast(m) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = m;
  t.classList.add('on');
  setTimeout(() => t.classList.remove('on'), 2600);
}

// Triple-tap logo = go to admin panel
let _logoTaps = 0;
let _logoTimer = null;
function adminLogoTap() {
  _logoTaps++;
  clearTimeout(_logoTimer);
  _logoTimer = setTimeout(() => { _logoTaps = 0; }, 500);
  if (_logoTaps >= 3 && isAdmin()) {
    _logoTaps = 0;
    navTo('profile');
    toast('Admin panel ✓');
  }
}

// Boot splash screen & skeleton state
(function initSplash() {
  document.documentElement.classList.add('beats-loading');
  setTimeout(() => {
    document.documentElement.classList.remove('beats-loading');
  }, 12000);

  let n = 1;
  const fill = document.getElementById('splash-bar-fill');
  const pct = document.getElementById('splash-pct');
  const splash = document.getElementById('klave-splash');
  const timer = setInterval(() => {
    n += Math.floor(Math.random() * 8) + 3;
    if (n >= 100) {
      n = 100;
      clearInterval(timer);
      setTimeout(() => {
        if (splash) {
          splash.style.opacity = '0';
          setTimeout(() => splash.remove(), 500);
        }
      }, 250);
    }
    if (fill) fill.style.width = n + '%';
    if (pct) pct.textContent = n + '%';
  }, 90);
})();

// Global Error / Rejection Diagnostics
(function initDiagnostics() {
  let overlay = null;
  function showError(msg) {
    if (!overlay) overlay = document.getElementById('debug-overlay');
    if (overlay) {
      overlay.style.display = 'block';
      overlay.textContent += msg + '\n\n';
    }
  }
  window.addEventListener('error', e => {
    showError('JS ERROR: ' + e.message + ' at ' + (e.filename || '?') + ':' + (e.lineno || '?'));
    console.error('KLAVE error:', e.error || e.message, e);
  });
  window.addEventListener('unhandledrejection', e => {
    const msg = e.reason && e.reason.message ? e.reason.message : JSON.stringify(e.reason);
    if (msg && msg.indexOf('INTERNAL ASSERTION FAILED') !== -1) {
      console.warn('Suppressed benign Firestore SDK error:', msg);
      return;
    }
    showError('PROMISE REJECTION: ' + msg);
    console.error('KLAVE unhandled rejection:', e.reason);
  });
})();

// Apply persisted display preferences
applyKlaveTheme(localStorage.getItem('klave-theme') || 'dark');
applyKlaveMotion(localStorage.getItem('klave-reduce-motion') === 'true');
applyKlaveCompact(localStorage.getItem('klave-compact') === 'true');

(function initCurrencySetting() {
  const ct = document.getElementById('toggle-currency');
  if (ct && localStorage.getItem('klave-currency') === 'ngn') ct.classList.add('on');
  if (localStorage.getItem('klave-currency') === 'ngn' && typeof getUsdToNgnRate === 'function') {
    getUsdToNgnRate().then(() => {
      if (typeof renderBeatOfTheWeek === 'function') renderBeatOfTheWeek();
    }).catch(() => {});
  }
})();

// Populate upload genre dropdown from single source of truth
(function initGenreDropdown() {
  const sel = document.getElementById('up-genre');
  if (sel) {
    sel.innerHTML = genres.map(g => '<option>' + g.name.replace(/&/g, '&amp;') + '</option>').join('');
  }
})();

// Swipe-down gesture to close Full-Screen Player
(function initFullPlayerSwipe() {
  const el = document.getElementById('full-player');
  if (!el) return;
  let y0 = null;
  el.addEventListener('touchstart', e => {
    if (e.target.closest('input,.fp-card') || el.scrollTop > 0) {
      y0 = null;
      return;
    }
    y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (y0 === null) return;
    const dy = e.changedTouches[0].clientY - y0;
    y0 = null;
    if (dy > 110) closeFullPlayer();
  }, { passive: true });
})();

// Drag & Drop Beat Upload
(function initUploadDragDrop() {
  const uh = document.getElementById('upload-hero');
  if (!uh) return;
  uh.addEventListener('dragover', e => {
    e.preventDefault();
    uh.classList.add('has-file');
  });
  uh.addEventListener('dragleave', () => uh.classList.remove('has-file'));
  uh.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) {
      document.getElementById('af').files = e.dataTransfer.files;
      onFileSelect(document.getElementById('af'));
    }
  });
})();

// PWA Service Worker
window._deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  window._deferredPrompt = e;
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// App DOM Initialization
document.addEventListener('DOMContentLoaded', () => {
  try { buildWave(); } catch (e) {}
  try { renderHome(); } catch (e) {}
  try { renderSearch(); } catch (e) {}
});
