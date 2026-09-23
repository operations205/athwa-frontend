'use strict';

const assert = require('assert');
const fs = require('fs');

const files = ['index.html', 'guest.html', 'staff.html', 'owner.html', 'manager.html', 'team.html'];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');

  assert.ok(!src.includes("localStorage.getItem('athwa_guest_token')"), `${file}: guest token must not be read from persistent localStorage`);
  assert.ok(!src.includes("localStorage.setItem('athwa_guest_token'"), `${file}: guest token must not be persisted in localStorage`);
  assert.ok(!src.includes("localStorage.getItem('athwa_staff_token')"), `${file}: staff token must not be read from persistent localStorage`);
  assert.ok(!src.includes("localStorage.setItem('athwa_staff_token'"), `${file}: staff token must not be persisted in localStorage`);
  assert.ok(!src.includes('localStorage.getItem(STATE_KEY)'), `${file}: user state must not persist after the browser session`);
  assert.ok(!src.includes('localStorage.setItem(STATE_KEY'), `${file}: user state must not persist after the browser session`);

  for (const required of [
    "sessionStorage.getItem('athwa_guest_token')",
    "sessionStorage.setItem('athwa_guest_token'",
    "sessionStorage.getItem('athwa_staff_token')",
    "sessionStorage.setItem('athwa_staff_token'",
    'sessionStorage.getItem(STATE_KEY)',
    'sessionStorage.setItem(STATE_KEY',
    'function defaultState()',
    'function resetSessionState()',
  ]) {
    assert.ok(src.includes(required), `${file}: missing session-safety construct: ${required}`);
  }

  const guestLogout = src.match(/function doLogout\(\)\{[\s\S]*?\n\}/);
  assert.ok(guestLogout, `${file}: doLogout() not found`);
  assert.ok(guestLogout[0].includes('resetSessionState()'), `${file}: guest logout must erase all user-specific state`);
  assert.ok(guestLogout[0].includes('setGuestToken(null)') && guestLogout[0].includes('setStaffToken(null)'), `${file}: guest logout must erase both possible tokens`);

  const staffLogout = src.match(/function staffLogout\(\)\{[\s\S]*?\n\}/);
  assert.ok(staffLogout, `${file}: staffLogout() not found`);
  assert.ok(staffLogout[0].includes('resetSessionState()'), `${file}: staff logout must erase all user-specific state`);
  assert.ok(staffLogout[0].includes('setGuestToken(null)') && staffLogout[0].includes('setStaffToken(null)'), `${file}: staff logout must erase both possible tokens`);

  const unifiedLogin = src.match(/async function unifiedLogin\(btn\)\{[\s\S]*?\n\}/);
  assert.ok(unifiedLogin && unifiedLogin[0].includes('resetSessionState()'), `${file}: a successful unified login must start from clean state`);
  assert.ok(unifiedLogin[0].includes('setStaffToken(null)') && unifiedLogin[0].includes('setGuestToken(null)'), `${file}: unified login must remove the other account type's token`);

  const adminLogin = src.match(/async function adminLogin\(btn\)\{[\s\S]*?\n\}/);
  assert.ok(adminLogin && adminLogin[0].includes('resetSessionState()'), `${file}: admin login must start from clean state`);
  assert.ok(adminLogin[0].includes('setGuestToken(null)'), `${file}: admin login must remove any guest token`);
}

console.log('PASS: tokens and user PII are session-scoped, and login/logout erase cross-user state in all 6 pages.');
