// Release-integration regression test (release/athwa-production-2026-09-08).
//
// staging and main had diverged: main carried 23 commits not present in
// staging's history, most notably the "permanent delete platform admin"
// feature and a dept-checkbox layout/overflow fix. This test proves the
// release branch keeps ALL of the following simultaneously, for every one
// of the 6 shared app files:
//   1. The permanent-delete-platform-admin feature still exists and is wired
//      into the UI (button + handler), i.e. nothing was dropped.
//   2. The handler uses the SAFE single-argument form and Number()-wraps the
//      id: deleteAdminPlatformAdmin(Number(a.id)) â this is the fixed form;
//      main's pre-fix version passed a raw a.email string too.
//   3. No inline onclick="..." attribute anywhere embeds a.email (or any
//      other free-text admin field) as JS â the exact XSS vector the
//      security-audit Phase 1 fix (on staging) closed, which had regressed
//      back into main via the independently-added delete feature.
//   4. The dept-checkbox layout/overflow-handling CSS from main survived
//      the integration (.dept-check flex/overflow rules + label element).
//
// Run with: node release-integrity-regression.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');

const FILES = ['index.html', 'guest.html', 'staff.html', 'owner.html', 'manager.html', 'team.html'];

let failures = [];

for (const file of FILES) {
  const src = fs.readFileSync(file, 'utf8');

  // 1) Permanent-delete feature still present and wired up.
  if (!/async function deleteAdminPlatformAdmin\(id\)\{/.test(src)) {
    failures.push(`${file}: deleteAdminPlatformAdmin(id) handler missing -- permanent-delete feature lost`);
  }
  if (!src.includes('ADMIN_PLATFORM_ADMINS.find')) {
    failures.push(`${file}: deleteAdminPlatformAdmin() no longer looks up the admin locally -- feature may be broken`);
  }
  if (!src.includes("t('delete_permanently')")) {
    failures.push(`${file}: delete_permanently button/label missing from admin table`);
  }

  // 2) Safe, Number()-wrapped, single-argument call site.
  if (!src.includes('deleteAdminPlatformAdmin(${Number(a.id)})')) {
    failures.push(`${file}: safe call site deleteAdminPlatformAdmin(\${Number(a.id)}) not found`);
  }

  // 3) No free-text (email) ever passed through inline onclick.
  if (/onclick="[^"]*a\.email[^"]*"/.test(src)) {
    failures.push(`${file}: a.email is embedded in an inline onclick handler -- XSS regression (pre-fix pattern reintroduced)`);
  }
  if (src.includes("deleteAdminPlatformAdmin(${a.id}, '${escapeHtml(a.email)}')")) {
    failures.push(`${file}: exact pre-fix vulnerable pattern deleteAdminPlatformAdmin(id, email) call site is present`);
  }

  // 4) dept-checkbox layout/overflow fix from main preserved.
  if (!/\.dept-check\{[^}]*overflow:hidden;?[^}]*\}/.test(src)) {
    failures.push(`${file}: .dept-check overflow-handling CSS rule missing -- main-only layout fix lost`);
  }
  if (!/\.dept-check span\{[^}]*overflow-wrap:break-word;?[^}]*\}/.test(src)) {
    failures.push(`${file}: .dept-check span overflow-wrap rule missing -- main-only layout fix lost`);
  }
  if (!src.includes('class="dept-check"')) {
    failures.push(`${file}: no <label class="dept-check"> element found -- feature markup missing`);
  }
}

if (failures.length) {
  console.error('FAIL: release-integrity regression\n' + failures.map(f => '  - ' + f).join('\n'));
  process.exit(1);
} else {
  console.log('PASS: permanent-delete-platform-admin feature intact (safe Number(a.id) form, no email in onclick) AND dept-checkbox layout fix intact, across all 6 files.');
}
