'use strict';

const assert = require('assert');
const fs = require('fs');

const files = ['index.html', 'guest.html', 'staff.html', 'owner.html', 'manager.html', 'team.html'];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  assert.ok(src.includes("if(p1.length < 12){ toast(t('password_too_short')); return; }"), `${file}: reset flow must enforce 12 characters`);
  assert.ok(src.includes("if(ownerPassword.length < 12){ toast(t('password_too_short')); return; }"), `${file}: hotel owner creation must enforce 12 characters`);
  assert.ok(src.includes("if(password.length < 12){ toast(t('password_too_short')); return; }"), `${file}: platform-admin creation must enforce 12 characters`);
  assert.ok(src.includes('Password must be at least 12 characters'), `${file}: English password guidance must match the backend`);
  assert.ok(src.includes('كلمة المرور لازم تكون 12 حرفًا على الأقل'), `${file}: Arabic password guidance must match the backend`);
  assert.ok(!src.includes('Password must be at least 8 characters'), `${file}: stale 8-character guidance remains`);
  assert.ok(!src.includes('p1.length < 8'), `${file}: stale 8-character reset policy remains`);
}

console.log('PASS: all 6 pages enforce and describe the backend 12-character password policy.');
