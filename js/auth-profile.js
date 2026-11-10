// ============================================================
// KLAVE — Auth, Profile, Admin, Referrals, NERO, Ratings & Settings
// ============================================================

document.documentElement.classList.add('role-artist');

function isAdmin() {
  return window._currentUser && window._currentUser.uid === ADMIN_UID;
}

function applyRoleUI() {
  const isProd = window._myRole === 'producer' || (window._currentUser && isAdmin());
  document.documentElement.classList.toggle('role-artist', !isProd);
  const pr = document.getElementById('prof-role');
  if (pr) pr.textContent = isProd ? 'Producer' : 'Artist';
}

async function switchToProducer() {
  const u = window._currentUser;
  if (!u) {
    document.getElementById('gate').classList.add('on');
    return;
  }
  if (window._myRole === 'producer') {
    toast('You are already a producer.');
    return;
  }
  if (!u.emailVerified) {
    toast('Verify your email first, then try again.');
    return;
  }
  if (!confirm('Switch this account to PRODUCER?\n\nYou will be able to upload and sell beats. This cannot be undone from the app.')) return;
  try {
    await window._setDoc(window._doc(window._db, 'users', u.uid), { role: 'producer' }, { merge: true });
    window._myRole = 'producer';
    const navUpBtn = document.getElementById('nav-upload-btn');
    if (navUpBtn) navUpBtn.style.display = 'flex';
    applyRoleUI();
    toast('You are now a producer ✓');
  } catch (e) {
    console.error('switchToProducer failed', e);
    toast('Could not switch role. Try again.');
  }
}

function applyAdminMode() {
  const adminBar = document.getElementById('admin-bar');
  const adminBadge = document.getElementById('admin-role-badge');
  const analyticsToggle = document.getElementById('analytics-admin-toggle');
  const roleTool = document.getElementById('admin-role-tool');
  if (adminBar) adminBar.classList.add('on');
  if (adminBadge) adminBadge.style.display = 'block';
  if (roleTool) roleTool.style.display = 'block';
  const referralPanel = document.getElementById('admin-referral-panel');
  if (referralPanel) {
    referralPanel.style.display = 'block';
    loadReferralAdminPanel();
  }
  if (analyticsToggle) analyticsToggle.style.display = 'flex';
  const av = document.getElementById('tb-av');
  if (av) {
    av.style.background = 'linear-gradient(135deg,var(--blue),var(--blue2))';
    av.style.boxShadow = '0 0 10px var(--blueglow)';
  }
}

function removeAdminMode() {
  const adminBar = document.getElementById('admin-bar');
  const adminBadge = document.getElementById('admin-role-badge');
  const analyticsToggle = document.getElementById('analytics-admin-toggle');
  const roleTool = document.getElementById('admin-role-tool');
  if (adminBar) adminBar.classList.remove('on');
  if (adminBadge) adminBadge.style.display = 'none';
  if (analyticsToggle) analyticsToggle.style.display = 'none';
  if (roleTool) roleTool.style.display = 'none';
  const referralPanel = document.getElementById('admin-referral-panel');
  if (referralPanel) referralPanel.style.display = 'none';
}

function commissionTier(referralCount) {
  if (referralCount >= 10) return 15;
  if (referralCount >= 5) return 10;
  return 5;
}

async function loadReferralAdminPanel() {
  const tbody = document.getElementById('referral-table-body');
  if (!tbody) return;
  try {
    const [usersSnap, waitlistSnap] = await Promise.all([
      window._getDocs(window._collection(window._db, 'users')),
      window._getDocs(window._collection(window._db, 'waitlist'))
    ]);

    const fromUsers = usersSnap.docs
      .map(d => ({ id: d.id, type: 'user', ...d.data() }))
      .filter(u => (u.referralCount || 0) > 0);

    await Promise.all(fromUsers
      .filter(u => (u.pendingReferralPayout || 0) > 0 && !u.bankDetails)
      .map(async u => {
        try {
          const s = await window._getDoc(window._doc(window._db, 'users', u.id, 'private', 'finance'));
          if (s.exists() && s.data().bankDetails) u.bankDetails = s.data().bankDetails;
        } catch (e) {}
      }));

    const fromWaitlist = waitlistSnap.docs
      .map(d => ({ id: d.id, type: 'waitlist', displayName: d.data().name, ...d.data() }))
      .filter(u => (u.referralCount || 0) > 0);

    const referrers = [...fromUsers, ...fromWaitlist]
      .sort((a, b) => (b.referralCount || 0) - (a.referralCount || 0));

    if (referrers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:10px 8px;color:var(--muted2);">No referrals yet.</td></tr>';
      return;
    }

    tbody.innerHTML = referrers.map(u => {
      const tier = commissionTier(u.referralCount || 0);
      const pending = (u.pendingReferralPayout || 0).toFixed(2);
      const label = (u.type === 'user' ? (u.username || '—') : (u.name || '—') + ' (waitlist)');
      return '<tr style="border-top:1px solid var(--grey2);">'
        + '<td style="padding:8px;">' + escapeHtml(label) + '</td>'
        + '<td style="padding:8px;">' + (u.referralCount || 0) + '</td>'
        + '<td style="padding:8px;">' + tier + '%</td>'
        + '<td style="padding:8px;">$' + pending + '</td>'
        + '<td style="padding:8px;display:flex;gap:6px;">'
          + '<button class="rbtn" onclick="payoutReferrer(\'' + u.id + '\',\'' + u.type + '\')" ' + ((u.pendingReferralPayout || 0) <= 0 || !u.bankDetails ? 'disabled' : '') + '>Pay now</button>'
          + '<button class="rbtn" onclick="markPayoutSettled(\'' + u.id + '\',\'' + u.type + '\')">Mark paid</button>'
        + '</td>'
        + '</tr>';
    }).join('');
  } catch (e) {
    console.error('Failed to load referral admin panel:', e);
    tbody.innerHTML = '<tr><td colspan="5" style="padding:10px 8px;color:var(--muted2);">Couldn\'t load referral data.</td></tr>';
  }
}

async function markPayoutSettled(id, collectionName) {
  try {
    await window._setDoc(window._doc(window._db, collectionName === 'user' ? 'users' : 'waitlist', id), { pendingReferralPayout: 0 }, { merge: true });
    toast('Marked as paid ✓');
    loadReferralAdminPanel();
  } catch (e) {
    console.error(e);
    toast('Could not update payout status');
  }
}

let _artFoundUid = null;
async function lookupUserForRoleFix() {
  const email = document.getElementById('art-email').value.trim();
  if (!email) {
    toast('Enter an email');
    return;
  }
  const resultBox = document.getElementById('art-result');
  const foundLabel = document.getElementById('art-found-label');
  resultBox.style.display = 'none';
  _artFoundUid = null;
  try {
    const q = window._query(window._collection(window._db, 'users'), window._where('email', '==', email));
    const snap = await window._getDocs(q);
    if (snap.empty) {
      toast('No account found with that email');
      return;
    }
    const d = snap.docs[0];
    _artFoundUid = d.id;
    const currentRole = d.data().role || 'buyer';
    foundLabel.textContent = 'Current role: ' + currentRole.toUpperCase();
    document.getElementById('art-btn-buyer').classList.toggle('on', currentRole === 'buyer');
    document.getElementById('art-btn-producer').classList.toggle('on', currentRole === 'producer');
    resultBox.style.display = 'block';
  } catch (e) {
    console.error(e);
    toast('Lookup failed — check console');
  }
}

async function setUserRole(newRole) {
  if (!_artFoundUid) {
    toast('Look up a user first');
    return;
  }
  if (!confirm("Set this account's role to " + newRole.toUpperCase() + '?')) return;
  try {
    await window._setDoc(window._doc(window._db, 'users', _artFoundUid), { role: newRole }, { merge: true });
    toast('Role updated to ' + newRole);
    document.getElementById('art-btn-buyer').classList.toggle('on', newRole === 'buyer');
    document.getElementById('art-btn-producer').classList.toggle('on', newRole === 'producer');
    document.getElementById('art-found-label').textContent = 'Current role: ' + newRole.toUpperCase();
  } catch (e) {
    console.error(e);
    toast('Could not update role — check console');
  }
}

function onAuthChange(user) {
  const av = document.getElementById('tb-av');
  const neroIn = document.getElementById('nero-input-wrap');
  const neroGate = document.getElementById('nero-gate-wrap');
  const msgs = document.getElementById('np-msgs');

  if (user) {
    const uname = user.email.split('@')[0];
    if (user.photoURL) {
      av.innerHTML = '<img src="' + escapeHtml(user.photoURL) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>';
    } else {
      av.textContent = uname[0].toUpperCase();
    }
    if (neroIn) neroIn.style.display = 'block';
    if (neroGate) neroGate.style.display = 'none';
    if (msgs && msgs.children.length <= 1) {
      const greeting = isAdmin()
        ? 'Welcome back, Admin. Platform is live. What are we building today?'
        : 'Hey ' + uname + ' — ask me about target audience, pricing, or where to post your beats.';
      msgs.innerHTML = '<div class="nm nm-n"><div class="nml">NERO</div>' + greeting + '</div>';
    }
    if (isAdmin()) applyAdminMode();
    else removeAdminMode();

    window._currentDisplayName = uname;
    const _adminLbl = document.getElementById('admin-user-label');
    if (_adminLbl) _adminLbl.textContent = uname;

    const navUpBtn = document.getElementById('nav-upload-btn');
    if (navUpBtn) navUpBtn.style.display = 'none';

    if (window._db) {
      window._getDoc(window._doc(window._db, 'users', user.uid)).then(snap => {
        if (snap.exists() && snap.data().displayName) {
          window._currentDisplayName = snap.data().displayName;
          const _al2 = document.getElementById('admin-user-label');
          if (_al2) _al2.textContent = snap.data().displayName;
        }
        window._myRole = snap.exists() ? (snap.data().role || 'buyer') : 'buyer';
        if (snap.exists() && snap.data().displayName && !window._nameSynced) {
          window._nameSynced = true;
          syncMyBeatNames(snap.data().displayName);
        }
        if (navUpBtn) navUpBtn.style.display = window._myRole === 'producer' ? 'flex' : 'none';
        applyRoleUI();
      }).catch(() => {});
    }
  } else {
    av.textContent = '?';
    if (neroIn) neroIn.style.display = 'none';
    if (neroGate) neroGate.style.display = 'block';
    removeAdminMode();
    window._myRole = null;
    applyRoleUI();
    const navUpBtn = document.getElementById('nav-upload-btn');
    if (navUpBtn) navUpBtn.style.display = 'none';
  }
}

// ── REFERRALS & BANK PAYOUTS ──
async function linkReferralIfPending(user) {
  try {
    const pendingRef = localStorage.getItem('klave_pending_ref');
    if (!pendingRef) return;
    const idToken = await user.getIdToken();
    const r = await fetch('/api/link-referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({ pendingRef })
    });
    if (r.ok) localStorage.removeItem('klave_pending_ref');
  } catch (e) {
    console.error('Referral linking failed:', e);
  }
}

let _banksLoaded = false;
async function loadBankListIntoDropdown() {
  const select = document.getElementById('payout-bank-select');
  if (!select || _banksLoaded) return;
  try {
    const r = await fetch('/api/bank-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list' })
    });
    const data = await r.json();
    if (!data.banks) throw new Error('no banks returned');
    select.innerHTML = '<option value="">Select your bank</option>'
      + data.banks.map(b => '<option value="' + b.code + '">' + escapeHtml(b.name) + '</option>').join('');
    _banksLoaded = true;
    prefillBankDetails();
  } catch (e) {
    select.innerHTML = '<option value="">Could not load banks — try again later</option>';
  }
}

async function prefillBankDetails() {
  if (!window._currentUser) return;
  const select = document.getElementById('payout-bank-select');
  const accInput = document.getElementById('payout-account-number');
  const nameLabel = document.getElementById('payout-account-name');
  if (!select || !accInput || !nameLabel) return;
  try {
    const uid = window._currentUser.uid;
    const privSnap = await window._getDoc(window._doc(window._db, 'users', uid, 'private', 'finance'));
    let bank = privSnap.exists() ? privSnap.data().bankDetails : null;
    if (!bank) {
      const snap = await window._getDoc(window._doc(window._db, 'users', uid));
      bank = snap.exists() ? snap.data().bankDetails : null;
    }
    if (!bank) return;
    accInput.value = bank.accountNumber || '';
    if (_banksLoaded && bank.bankCode) select.value = bank.bankCode;
    if (bank.accountName) nameLabel.textContent = '✓ ' + bank.accountName + ' (on file)';
  } catch (e) {}
}

async function verifyAndSaveBankDetails() {
  const bankSelect = document.getElementById('payout-bank-select');
  const accInput = document.getElementById('payout-account-number');
  const nameLabel = document.getElementById('payout-account-name');
  const bankCode = bankSelect.value;
  const accountNumber = accInput.value.trim();

  if (!bankCode || accountNumber.length < 10) {
    nameLabel.textContent = 'Select a bank and enter a valid account number.';
    return;
  }

  nameLabel.textContent = 'Verifying…';
  try {
    const r = await fetch('/api/bank-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve', accountNumber, bankCode })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Verification failed');

    nameLabel.textContent = '✓ ' + data.accountName;

    const idToken = await window._currentUser.getIdToken();
    const saveRes = await fetch('/api/bank-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({
        action: 'save',
        accountNumber: data.accountNumber,
        bankCode,
        bankName: bankSelect.options[bankSelect.selectedIndex].text,
        accountName: data.accountName
      })
    });
    const saveData = await saveRes.json();
    if (!saveRes.ok) throw new Error(saveData.error || 'Could not save bank details');
    toast('Bank details saved ✓');
  } catch (e) {
    nameLabel.textContent = 'Could not verify: ' + e.message;
  }
}

async function runSecureBeats() {
  const btn = document.getElementById('secure-beats-btn');
  try {
    if (btn) btn.disabled = true;
    toast('Securing beats…');
    const t = await window._currentUser.getIdToken();
    const r = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify({ action: 'secure-existing' })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Failed');
    if (d.failed && d.failed.length) {
      console.error(d.failed);
      toast('Secured ' + d.secured + ' of ' + d.total + '. ' + d.failed.length + ' failed: ' + (d.failed[0].error || 'see console'));
    } else {
      toast('Done ✓ secured ' + d.secured + ' beat(s)');
    }
    if (typeof window._loadBeats === 'function') await window._loadBeats();
  } catch (e) {
    console.error(e);
    toast('Failed: ' + e.message);
  }
  if (btn) btn.disabled = false;
}

async function payoutReferrer(id, type) {
  try {
    toast('Sending payout…');
    const idToken = await window._currentUser.getIdToken();
    const r = await fetch('/api/payout-referrals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({ referrerId: id, referrerType: type })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Payout failed');
    toast(data.note ? data.note : 'Payout sent ✓ (₦' + data.amountNgn.toLocaleString() + ')');
    loadReferralAdminPanel();
  } catch (e) {
    console.error(e);
    toast('Payout failed: ' + e.message);
  }
}

// ── AUTH FLOWS ──
function authTab(btn, t) {
  document.querySelectorAll('.at').forEach(x => x.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('role-wrap').style.display = t === 'up' ? 'block' : 'none';
  const tc = document.getElementById('terms-check');
  if (tc) tc.style.display = t === 'up' ? 'flex' : 'none';
  _authMode = t;
  clearErr();
}

function pickRole(b) {
  document.querySelectorAll('.rbtn').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
}

function showErr(m) {
  const e = document.getElementById('auth-err');
  e.textContent = m;
  e.style.display = 'block';
}

function clearErr() {
  const e = document.getElementById('auth-err');
  if (e) e.style.display = 'none';
}

function showAuthForm() {
  document.getElementById('verify-wrap').style.display = 'none';
  document.getElementById('auth-form-wrap').style.display = 'block';
  document.querySelectorAll('.at').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.at')[0].classList.add('on');
  document.getElementById('role-wrap').style.display = 'none';
  _authMode = 'in';
}

async function resendVerify() {
  const btn = document.getElementById('resend-btn');
  btn.textContent = 'SENDING...';
  btn.disabled = true;
  try {
    const pass = document.getElementById('a-pass').value.trim();
    if (!pass) {
      toast('Re-enter password to resend');
      btn.textContent = 'RESEND EMAIL';
      btn.disabled = false;
      return;
    }
    const c = await window._signIn(window._auth, _pendingEmail, pass);
    await window._sendVerification(c.user);
    await window._signOut(window._auth);
    toast('Verification email sent ✓');
  } catch (e) {
    toast('Could not resend. Try again.');
  }
  btn.textContent = 'RESEND EMAIL';
  btn.disabled = false;
}

async function doGoogleAuth() {
  clearErr();
  try {
    window._googleProvider.setCustomParameters({ prompt: 'select_account' });
    const result = await window._signInWithPopup(window._auth, window._googleProvider);
    const user = result.user;
    if (window._db) {
      const existingSnap = await window._getDoc(window._doc(window._db, 'users', user.uid));
      const role = document.querySelector('.rbtn.on')?.dataset?.role || 'buyer';
      const userData = {
        email: user.email,
        displayName: user.displayName || '',
        photoURL: user.photoURL || ''
      };
      if (!existingSnap.exists()) {
        userData.role = role;
        userData.tier = 'free';
        userData.createdAt = window._ts();
      }
      await window._setDoc(window._doc(window._db, 'users', user.uid), userData, { merge: true });
    }
    toast('Welcome to KLAVE ✓');
    setTimeout(() => {
      if (isAdmin(window._currentUser)) navTo('profile');
      else navTo('home');
    }, 800);
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user') return;
    if (err.code === 'auth/popup-blocked') {
      showErr('Popup blocked. Allow popups for this site.');
      return;
    }
    showErr('Google sign-in failed. Try again.');
    console.error(err);
  }
}

async function doAuth() {
  clearErr();
  const email = document.getElementById('a-email').value.trim();
  const pass = document.getElementById('a-pass').value.trim();
  if (!email) {
    showErr('Enter your email');
    return;
  }
  if (!pass) {
    showErr('Enter your password');
    return;
  }
  if (_authMode === 'up') {
    const checkbox = document.getElementById('copy-checkbox');
    if (!checkbox || !checkbox.checked) {
      showErr('Please agree to the Terms of Service');
      return;
    }
  }
  const btn = document.getElementById('auth-btn');
  btn.textContent = 'LOADING...';
  btn.disabled = true;
  try {
    if (_authMode === 'up') {
      const tc = document.getElementById('terms-checkbox');
      if (!tc || !tc.checked) {
        document.getElementById('terms-check').classList.add('required');
        showErr('Please agree to the Terms of Service');
        btn.textContent = 'ENTER';
        btn.disabled = false;
        return;
      }
      const role = document.querySelector('.rbtn.on')?.dataset?.role || 'buyer';
      const c = await window._createUser(window._auth, email, pass);
      await window._sendVerification(c.user);
      const uname = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      await window._setDoc(window._doc(window._db, 'users', c.user.uid), {
        email,
        role,
        username: uname,
        createdAt: window._ts()
      });
      await linkReferralIfPending(c.user);
      await window._signOut(window._auth);
      _pendingEmail = email;
      document.getElementById('auth-form-wrap').style.display = 'none';
      document.getElementById('verify-wrap').style.display = 'block';
      document.getElementById('vb-email').textContent = email;
    } else {
      const c = await window._signIn(window._auth, email, pass);
      const hasGoogleProvider = c.user.providerData.some(p => p.providerId === 'google.com');
      if (!c.user.emailVerified && !hasGoogleProvider) {
        await window._signOut(window._auth);
        showErr('Email not verified. Check your inbox.');
        btn.textContent = 'ENTER';
        btn.disabled = false;
        return;
      }
      toast('Welcome back ✓');
      setTimeout(() => {
        if (isAdmin(window._currentUser)) navTo('profile');
        else navTo('home');
      }, 800);
    }
  } catch (err) {
    const msg = err.code === 'auth/email-already-in-use'
      ? 'Email already registered'
      : err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
        ? 'Wrong password'
        : err.code === 'auth/user-not-found'
          ? 'No account found'
          : err.code === 'auth/weak-password'
            ? 'Password needs 6+ characters'
            : err.code === 'auth/invalid-email'
              ? 'Invalid email'
              : 'Something went wrong';
    showErr(msg);
  }
  btn.textContent = 'ENTER';
  btn.disabled = false;
}

async function doSignOut() {
  await window._signOut(window._auth);
  toast('Signed out');
  navTo('home');
}

function toggleTermsCheck() {
  const cb = document.getElementById('terms-checkbox');
  cb.checked = !cb.checked;
  document.getElementById('terms-check').classList.toggle('required', !cb.checked);
}

function toggleCopyCheck() {
  const cb = document.getElementById('copy-checkbox');
  cb.checked = !cb.checked;
  document.getElementById('signup-terms').classList.toggle('required', !cb.checked);
}

// ── PROFILE ──
function loadProfile() {
  const user = window._currentUser;
  if (!user) return;
  const uname = user.email.split('@')[0];
  const av = document.getElementById('prof-av');
  document.getElementById('prof-email').textContent = user.email;
  const adminUserLabel = document.getElementById('admin-user-label');
  if (adminUserLabel) adminUserLabel.textContent = window._currentDisplayName || uname;

  document.getElementById('prof-view-mode').style.display = 'block';
  document.getElementById('prof-edit-mode').style.display = 'none';

  if (user.photoURL) {
    av.innerHTML = '<img src="' + escapeHtml(user.photoURL) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>';
  } else {
    av.textContent = uname[0].toUpperCase();
  }

  if (window._db) {
    const followsRef = window._collection(window._db, 'follows');
    window._getDocs(window._query(followsRef, window._where('followingId', '==', user.uid))).then(snap => {
      document.getElementById('ps-followers').textContent = snap.size;
    }).catch(() => {});
    window._getDocs(window._query(followsRef, window._where('followerId', '==', user.uid))).then(snap => {
      document.getElementById('ps-following').textContent = snap.size;
    }).catch(() => {});

    window._getDocs(window._collection(window._db, 'beats')).then(snap => {
      const mine = snap.docs.filter(d => d.data().producerId === user.uid);
      document.getElementById('ps-b').textContent = mine.length;
    }).catch(() => {});

    window._getDoc(window._doc(window._db, 'users', user.uid)).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        const name = data.displayName || uname;
        document.getElementById('prof-name').textContent = name;
        document.getElementById('pf-name').value = name;
        if (adminUserLabel) adminUserLabel.textContent = name;
        document.getElementById('prof-bio-display').textContent = data.bio || 'No bio yet.';
        if (data.bio) document.getElementById('pf-bio').value = data.bio;
        if (data.photoURL && !user.photoURL) {
          av.innerHTML = '<img src="' + escapeHtml(data.photoURL) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>';
        }
        const tbAv = document.getElementById('tb-av');
        if (tbAv && !user.photoURL) tbAv.textContent = name[0].toUpperCase();

        window._myTier = data.tier || 'free';
        window._mySubCode = data.subscriptionCode || null;
        const tierLabel = { free: 'Free plan', pro7: 'Pro plan — $7/mo', pro25: 'Pro+ plan — $25/mo' }[window._myTier] || 'Free plan';
        const tierEl = document.getElementById('settings-current-tier');
        if (tierEl) tierEl.textContent = tierLabel;
      } else {
        document.getElementById('prof-name').textContent = uname;
        document.getElementById('pf-name').value = uname;
      }
    }).catch(() => {
      document.getElementById('prof-name').textContent = uname;
      document.getElementById('pf-name').value = uname;
    });
  } else {
    document.getElementById('prof-name').textContent = uname;
    document.getElementById('pf-name').value = uname;
  }
}

function enterProfileEdit() {
  document.getElementById('prof-view-mode').style.display = 'none';
  document.getElementById('prof-edit-mode').style.display = 'block';
}

function exitProfileEdit() {
  document.getElementById('prof-edit-mode').style.display = 'none';
  document.getElementById('prof-view-mode').style.display = 'block';
}

let _avatarUploading = false;
async function handleAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  if (!window._currentUser) {
    toast('Sign in first');
    return;
  }
  if (!file.type.startsWith('image/')) {
    toast('Choose an image file');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    toast('Image must be under 8MB');
    return;
  }
  const av = document.getElementById('prof-av');
  const reader = new FileReader();
  reader.onload = e => {
    av.innerHTML = '<img src="' + e.target.result + '"/>';
  };
  reader.readAsDataURL(file);

  if (_avatarUploading) {
    toast('Still uploading the last photo — one sec');
    return;
  }
  _avatarUploading = true;
  try {
    const _idToken = await window._auth.currentUser.getIdToken();
    const signRes = await fetch('/api/upload-avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + _idToken },
      body: JSON.stringify({ fileName: file.name })
    });
    const sign = await signRes.json();
    if (sign.error) throw new Error(sign.error);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('api_key', sign.apiKey);
    fd.append('timestamp', sign.timestamp);
    fd.append('signature', sign.signature);
    fd.append('public_id', sign.publicId);
    fd.append('upload_preset', sign.uploadPreset);
    const res = await fetch('https://api.cloudinary.com/v1_1/' + sign.cloudName + '/auto/upload', { method: 'POST', body: fd });
    const cd = await res.json();
    if (cd.error) throw new Error(cd.error.message || 'Image upload failed');
    if (!cd.secure_url) throw new Error('Image upload failed');

    await window._updateProfile(window._currentUser, { photoURL: cd.secure_url });
    await window._setDoc(window._doc(window._db, 'users', window._currentUser.uid), { photoURL: cd.secure_url, updatedAt: window._ts() }, { merge: true });

    const imgHtml = '<img src="' + escapeHtml(cd.secure_url) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>';
    av.innerHTML = imgHtml;
    const tbAv = document.getElementById('tb-av');
    if (tbAv) tbAv.innerHTML = imgHtml;
    toast('Profile photo updated ✓');
  } catch (e) {
    console.error('Avatar upload failed:', e);
    toast('Photo upload failed: ' + (e.message || 'try again'));
    if (window._currentUser.photoURL) {
      av.innerHTML = '<img src="' + escapeHtml(window._currentUser.photoURL) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>';
    } else {
      av.textContent = (window._currentUser.email || '?')[0].toUpperCase();
    }
  }
  _avatarUploading = false;
}

async function syncMyBeatNames(name) {
  const u = window._currentUser;
  if (!u || !name || !window._db) return;
  try {
    if (!window._firestoreBeats && window._loadBeats) await window._loadBeats();
    const stale = getBeats().filter(b => b.producerId === u.uid && b.id && b.prod !== name);
    if (!stale.length) return;
    const results = await Promise.allSettled(
      stale.map(b => window._updateDoc(window._doc(window._db, 'beats', b.id), { prod: name }))
    );
    let failed = 0;
    let firstErr = null;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') stale[i].prod = name;
      else {
        failed++;
        firstErr = firstErr || r.reason;
      }
    });
    if (failed) {
      console.error('syncMyBeatNames failed', firstErr);
      toast('Name updated on ' + (stale.length - failed) + ' beat(s); ' + failed + ' failed');
    } else {
      toast('Name updated on ' + stale.length + ' beat(s) ✓');
    }
    if (typeof renderHome === 'function') renderHome();
    if (typeof renderSearch === 'function') renderSearch();
  } catch (e) {
    console.error('syncMyBeatNames failed', e);
    toast('Could not update beat names: ' + (e.code || e.message || 'unknown'));
  }
}

async function saveProfile() {
  if (!window._currentUser) {
    toast('Sign in first');
    return;
  }
  const name = document.getElementById('pf-name').value.trim();
  const bio = document.getElementById('pf-bio').value.trim();
  try {
    await window._setDoc(window._doc(window._db, 'users', window._currentUser.uid), { displayName: name, bio, updatedAt: window._ts() }, { merge: true });
    const displayName = name || window._currentUser.email.split('@')[0];
    document.getElementById('prof-name').textContent = displayName;
    document.getElementById('prof-bio-display').textContent = bio || 'No bio yet.';
    const tbAv = document.getElementById('tb-av');
    if (tbAv && !window._currentUser.photoURL) tbAv.textContent = displayName[0].toUpperCase();
    const adminUserLabel = document.getElementById('admin-user-label');
    if (adminUserLabel) adminUserLabel.textContent = displayName;
    window._currentDisplayName = displayName;
    if (name) syncMyBeatNames(name);
    toast('Profile saved ✓');
    exitProfileEdit();
  } catch (e) {
    console.error('saveProfile error:', e);
    toast('Failed: ' + (e.message || e.code || 'unknown error'));
  }
}

// ── NERO PANEL ──
function toggleNero() {
  nopen = !nopen;
  document.getElementById('nero-panel').classList.toggle('on', nopen);
  document.getElementById('nero-overlay').classList.toggle('on', nopen);
}

async function sendNero() {
  if (!window._currentUser) {
    toast('Sign in to use NERO');
    return;
  }
  const inp = document.getElementById('ni-inp');
  const txt = inp.value.trim();
  if (!txt) return;
  inp.value = '';
  const msgs = document.getElementById('np-msgs');
  const ud = document.createElement('div');
  ud.className = 'nm nm-u';
  ud.textContent = txt;
  msgs.appendChild(ud);

  const td = document.createElement('div');
  td.className = 'nm nm-n';
  td.innerHTML = '<div class="nml">NERO</div><div class="na-loading"><div class="na-dot"></div><div class="na-dot"></div><div class="na-dot"></div></div>';
  msgs.appendChild(td);
  msgs.scrollTop = msgs.scrollHeight;

  try {
    const r = await fetch('/api/nero', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: txt }] })
    });
    const data = await r.json();
    if (data.error) td.innerHTML = '<div class="nml">NERO</div>Error: ' + escapeHtml(data.error);
    else td.innerHTML = '<div class="nml">NERO</div>' + escapeHtml(data.content?.[0]?.text || 'No response.');
  } catch (e) {
    td.innerHTML = '<div class="nml">NERO</div>Error: ' + escapeHtml(e.message);
  }
  msgs.scrollTop = msgs.scrollHeight;
}

// ── REPORTS & RATINGS ──
let _reportBeat = '';
let _reportReason = '';

function openReport(title, e) {
  if (e) e.stopPropagation();
  _reportBeat = title;
  _reportReason = '';
  document.getElementById('report-beat-name').textContent = 'Reporting: ' + title;
  document.querySelectorAll('.report-opt').forEach(o => o.classList.remove('on'));
  document.getElementById('report-modal').classList.add('on');
}

function closeReport() {
  document.getElementById('report-modal').classList.remove('on');
}

function selectReport(btn) {
  document.querySelectorAll('.report-opt').forEach(o => o.classList.remove('on'));
  btn.classList.add('on');
  _reportReason = btn.textContent;
}

async function submitReport() {
  if (!_reportReason) {
    toast('Select a reason');
    return;
  }
  if (!window._currentUser) {
    toast('Sign in to report');
    closeReport();
    return;
  }
  try {
    await window._addDoc(window._collection(window._db, 'reports'), {
      beat: _reportBeat,
      reason: _reportReason,
      reportedBy: window._currentUser.uid,
      createdAt: window._ts()
    });
    toast('Report submitted ✓');
  } catch (e) {
    toast('Report sent ✓');
  }
  closeReport();
}

async function openRateModal() {
  if (!cur || !cur.id) {
    toast('Play a beat first');
    return;
  }
  if (!window._currentUser) {
    toast('Sign in to rate beats');
    gated();
    return;
  }
  document.getElementById('rate-beat-name').textContent = cur.title;
  document.querySelectorAll('.rate-star').forEach(s => s.classList.remove('filled'));
  document.getElementById('rate-modal').classList.add('on');
  await refreshRatingAverage(cur.id);
  try {
    const snap = await window._getDoc(window._doc(window._db, 'ratings', cur.id + '_' + window._currentUser.uid));
    if (snap.exists()) highlightStars(snap.data().value);
  } catch (e) {}
}

function closeRateModal() {
  document.getElementById('rate-modal').classList.remove('on');
}

function highlightStars(value) {
  document.querySelectorAll('.rate-star').forEach(s => {
    s.classList.toggle('filled', Number(s.dataset.val) <= value);
  });
}

async function submitRating(value) {
  if (!window._currentUser || !cur || !cur.id) return;
  highlightStars(value);
  if (cur.isMock) {
    toast('Rating saved ✓');
    return;
  }
  try {
    await window._setDoc(window._doc(window._db, 'ratings', cur.id + '_' + window._currentUser.uid), {
      beatId: cur.id,
      userId: window._currentUser.uid,
      value: value,
      createdAt: window._ts(),
      updatedAt: window._ts()
    }, { merge: true });
    toast('Rating saved ✓');
    await refreshRatingAverage(cur.id);
  } catch (e) {
    console.error('submitRating error:', e);
    toast('Failed to save rating');
  }
}

async function refreshRatingAverage(beatId) {
  const el = document.getElementById('rate-avg-display');
  if (beatId === BOTW_MOCK.id) {
    if (el) el.textContent = BOTW_MOCK.rating + ' ★ (' + BOTW_MOCK.ratingCount + ' ratings)';
    return;
  }
  if (!window._db) {
    if (el) el.textContent = 'No ratings yet';
    return;
  }
  try {
    const snap = await window._getDocs(window._query(window._collection(window._db, 'ratings'), window._where('beatId', '==', beatId)));
    if (snap.empty) {
      if (el) el.textContent = 'No ratings yet';
      return;
    }
    const vals = snap.docs.map(d => d.data().value);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (el) el.textContent = avg.toFixed(1) + ' ★ (' + vals.length + ' rating' + (vals.length === 1 ? '' : 's') + ')';
  } catch (e) {
    if (el) el.textContent = 'No ratings yet';
  }
}

// ── SETTINGS & PREFERENCES ──
function toggleSetting(id) {
  document.getElementById(id).classList.toggle('on');
}

function applyKlaveTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = document.getElementById('toggle-theme');
  if (toggle) {
    if (theme === 'light') toggle.classList.add('on');
    else toggle.classList.remove('on');
  }
}

function toggleKlaveTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem('klave-theme', next);
  applyKlaveTheme(next);
}

function toggleKlaveCurrency() {
  const current = localStorage.getItem('klave-currency') || 'usd';
  const next = current === 'usd' ? 'ngn' : 'usd';
  localStorage.setItem('klave-currency', next);
  location.reload();
}

function applyKlaveMotion(reduced) {
  document.documentElement.setAttribute('data-reduce-motion', reduced ? 'true' : 'false');
  const toggle = document.getElementById('toggle-motion');
  if (toggle) {
    if (reduced) toggle.classList.add('on');
    else toggle.classList.remove('on');
  }
}

function toggleKlaveMotion() {
  const current = document.documentElement.getAttribute('data-reduce-motion') === 'true';
  const next = !current;
  localStorage.setItem('klave-reduce-motion', next ? 'true' : 'false');
  applyKlaveMotion(next);
}

function applyKlaveCompact(compact) {
  document.documentElement.setAttribute('data-compact', compact ? 'true' : 'false');
  const toggle = document.getElementById('toggle-compact');
  if (toggle) {
    if (compact) toggle.classList.add('on');
    else toggle.classList.remove('on');
  }
}

function toggleKlaveCompact() {
  const current = document.documentElement.getAttribute('data-compact') === 'true';
  const next = !current;
  localStorage.setItem('klave-compact', next ? 'true' : 'false');
  applyKlaveCompact(next);
}

function isGoogleOnlyUser() {
  const user = window._currentUser;
  if (!user || !user.providerData) return false;
  const hasPassword = user.providerData.some(p => p.providerId === 'password');
  const hasGoogle = user.providerData.some(p => p.providerId === 'google.com');
  return hasGoogle && !hasPassword;
}

function openChangePassword() {
  document.getElementById('cp-current').value = '';
  document.getElementById('cp-new').value = '';
  document.getElementById('cp-err').style.display = 'none';

  if (isGoogleOnlyUser()) {
    document.getElementById('password-modal-title').textContent = 'SET PASSWORD';
    document.getElementById('password-modal-sub').textContent = 'You signed up with Google. Set a password to also log in with email.';
    document.getElementById('cp-current-wrap').style.display = 'none';
    document.getElementById('cp-new-label').textContent = 'New Password';
    document.getElementById('cp-submit-btn').textContent = 'SET PASSWORD';
  } else {
    document.getElementById('password-modal-title').textContent = 'CHANGE PASSWORD';
    document.getElementById('password-modal-sub').textContent = 'Enter your current and new password.';
    document.getElementById('cp-current-wrap').style.display = 'block';
    document.getElementById('cp-new-label').textContent = 'New Password';
    document.getElementById('cp-submit-btn').textContent = 'UPDATE';
  }
  document.getElementById('password-modal').classList.add('on');
}

function closePasswordModal() {
  document.getElementById('password-modal').classList.remove('on');
}

async function submitPasswordChange() {
  const newPass = document.getElementById('cp-new').value.trim();
  const errEl = document.getElementById('cp-err');
  errEl.style.display = 'none';
  if (!newPass) {
    errEl.textContent = 'Enter a password';
    errEl.style.display = 'block';
    return;
  }
  if (newPass.length < 6) {
    errEl.textContent = 'Password needs 6+ characters';
    errEl.style.display = 'block';
    return;
  }

  const user = window._auth.currentUser;
  if (isGoogleOnlyUser()) {
    try {
      const cred = window._EmailAuthProvider.credential(user.email, newPass);
      await window._linkWithCredential(user, cred);
      toast('Password set ✓ You can now log in with email too.');
      closePasswordModal();
    } catch (e) {
      errEl.textContent = 'Failed to set password: ' + (e.message || 'try again');
      errEl.style.display = 'block';
    }
    return;
  }

  const current = document.getElementById('cp-current').value.trim();
  if (!current) {
    errEl.textContent = 'Enter your current password';
    errEl.style.display = 'block';
    return;
  }
  try {
    const cred = window._EmailAuthProvider.credential(user.email, current);
    await window._reauthenticate(user, cred);
    await window._updatePassword(user, newPass);
    toast('Password updated ✓');
    closePasswordModal();
  } catch (e) {
    const msg = e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
      ? 'Current password is incorrect'
      : 'Failed to update password';
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
}

function openChangeEmail() {
  document.getElementById('ce-pass').value = '';
  document.getElementById('ce-email').value = '';
  document.getElementById('ce-err').style.display = 'none';
  document.getElementById('email-modal').classList.add('on');
}

function closeEmailModal() {
  document.getElementById('email-modal').classList.remove('on');
}

async function submitEmailChange() {
  const pass = document.getElementById('ce-pass').value.trim();
  const newEmail = document.getElementById('ce-email').value.trim();
  const errEl = document.getElementById('ce-err');
  errEl.style.display = 'none';
  if (!pass || !newEmail) {
    errEl.textContent = 'Fill in both fields';
    errEl.style.display = 'block';
    return;
  }
  try {
    const user = window._auth.currentUser;
    const cred = window._EmailAuthProvider.credential(user.email, pass);
    await window._reauthenticate(user, cred);
    await window._updateEmail(user, newEmail);
    await window._sendVerification(user);
    toast('Email updated — verify your new email ✓');
    closeEmailModal();
    document.getElementById('prof-email').textContent = newEmail;
  } catch (e) {
    const msg = e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
      ? 'Password is incorrect'
      : e.code === 'auth/email-already-in-use'
        ? 'Email already in use'
        : 'Failed to update email';
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
}

async function confirmDeleteAccount() {
  const user = window._auth && window._auth.currentUser;
  if (!user) {
    toast('You need to be signed in.');
    return;
  }
  if (!window.confirm('Delete your account? This cannot be undone.')) return;
  try {
    await window._deleteUser(user);
    toast('Account deleted.');
    setTimeout(() => location.reload(), 500);
  } catch (e) {
    console.error('Delete account failed:', e);
    if (e && e.code === 'auth/requires-recent-login') {
      toast('Please sign in again, then try deleting your account.');
    } else {
      toast('Could not delete account. Please try again.');
    }
  }
}
