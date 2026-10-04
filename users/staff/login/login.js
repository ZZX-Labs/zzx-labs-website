/* Front-end login handler
   - Validates form
   - Toggles password visibility
   - Optionally uses WebAuthn (Security Key / Passkey)
   - Posts payload to your backend endpoint (adjust URL)
*/

const form = document.getElementById('staff-login-form');
const statusEl = document.getElementById('form-status');
const togglePwBtn = document.getElementById('toggle-password');
const pwInput = document.getElementById('password');
const gpgInput = document.getElementById('gpg');
const webauthnBtn = document.getElementById('webauthn-btn');
const webauthnAssertionEl = document.getElementById('webauthn-assertion');

/** Utilities */
function setStatus(message, cls = '') {
  statusEl.textContent = message || '';
  statusEl.className = `status ${cls}`;
}
function cleanFingerprint(s) {
  return String(s || '').replace(/\s+/g, '').toUpperCase();
}
function isValidFingerprint(s) {
  return /^[A-F0-9]{40}$/.test(cleanFingerprint(s));
}
function setInvalid(el, invalid = true) {
  el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
}

/** Toggle password visibility */
togglePwBtn?.addEventListener('click', () => {
  pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
  togglePwBtn.setAttribute('aria-label', pwInput.type === 'password' ? 'Show password' : 'Hide password');
});

/** Optional: WebAuthn */
webauthnBtn?.addEventListener('click', async () => {
  setStatus('Waiting for security key…');
  try {
    // Normally you'd fetch a challenge & options from your backend first:
    // const res = await fetch('/api/auth/webauthn/options', { credentials: 'include' });
    // const publicKey = await res.json();

    // Demo-only options (replace with your server-provided config):
    const publicKey = {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      timeout: 60000,
      userVerification: 'preferred',
      rpId: location.hostname,
      allowCredentials: [] // Fill with registered credential IDs (base64url → Uint8Array)
    };

    const assertion = await navigator.credentials.get({ publicKey });
    // Serialize for transport. Your backend must verify it.
    const clientDataJSON = btoa(String.fromCharCode(...new Uint8Array(assertion.response.clientDataJSON)));
    const authenticatorData = btoa(String.fromCharCode(...new Uint8Array(assertion.response.authenticatorData)));
    const signature = btoa(String.fromCharCode(...new Uint8Array(assertion.response.signature)));
    const userHandle = assertion.response.userHandle ? btoa(String.fromCharCode(...new Uint8Array(assertion.response.userHandle))) : null;
    const credId = btoa(String.fromCharCode(...new Uint8Array(assertion.rawId)));

    const payload = { id: assertion.id, rawId: credId, type: assertion.type, response: { clientDataJSON, authenticatorData, signature, userHandle } };
    webauthnAssertionEl.value = JSON.stringify(payload);
    setStatus('Security key assertion captured.', 'ok');
  } catch (err) {
    console.error(err);
    setStatus(`Security key failed: ${err.message}`, 'err');
  }
});

/** Form submit */
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('');

  // Basic validation
  const username = form.username.value.trim();
  const email = form.email.value.trim();
  const gpg = form.gpg.value.trim();
  const password = form.password.value;
  const yubicoOtp = form.yubico_otp.value.trim();
  const remember = form.remember.checked;

  let ok = true;

  if (username.length < 3) { setInvalid(form.username, true); ok = false; } else setInvalid(form.username, false);
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { setInvalid(form.email, true); ok = false; } else setInvalid(form.email, false);
  if (!isValidFingerprint(gpg)) { setInvalid(gpgInput, true); ok = false; } else setInvalid(gpgInput, false);
  if (password.length < 10) { setInvalid(form.password, true); ok = false; } else setInvalid(form.password, false);

  if (!ok) {
    setStatus('Please fix the highlighted fields.', 'err');
    return;
  }

  // Build payload
  const payload = {
    username,
    email,
    gpg_fpr: cleanFingerprint(gpg),
    password,
    yubico_otp: yubicoOtp || null,
    webauthn_assertion: webauthnAssertionEl.value ? JSON.parse(webauthnAssertionEl.value) : null,
    remember: !!remember
  };

  // CSRF (optional)
  const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || null;

  // POST to your backend (adjust endpoint)
  try {
    setStatus('Signing in…');
    const res = await fetch('/api/auth/staff/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {})
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => 'Login failed');
      setStatus(msg || 'Login failed', 'err');
      return;
    }

    const data = await res.json().catch(() => ({}));
    setStatus('Authenticated. Redirecting…', 'ok');

    // Redirect (adjust as needed)
    const next = data?.next || '/users/staff/';
    location.href = next;
  } catch (err) {
    console.error(err);
    setStatus(`Network error: ${err.message}`, 'err');
  }
});
