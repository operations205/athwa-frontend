// Regression test: every staff role that can log in must have a non-empty
// entry in STAFF_NAV_BY_ROLE (otherwise the bottom/side nav renders empty
// and the role has no way to navigate the app), and every role must resolve
// to a real translated label via t('role_'+role) in both AR and EN (otherwise
// the raw i18n key leaks into the UI). Regression for the 'dept' vs
// 'dept_manager' key-name bug found during Staging role testing.
const fs = require('fs');

const FILES = ['index.html','guest.html','staff.html','owner.html','manager.html','team.html'];
// Roles the backend actually issues (routes-auth.js / routes-users.js
// MANAGEABLE_ROLES + owner + platform_admin).
const KNOWN_ROLES = ['owner','manager','dept_manager','staff','platform_admin'];

let failures = [];

for (const file of FILES) {
  const src = fs.readFileSync(file, 'utf8');

  // Extract STAFF_NAV_BY_ROLE object literal
  const navMatch = src.match(/const STAFF_NAV_BY_ROLE = \{([\s\S]*?)\n\};/);
  if (!navMatch) { failures.push(`${file}: STAFF_NAV_BY_ROLE not found`); continue; }
  const navBody = navMatch[1];

  for (const role of KNOWN_ROLES) {
    const re = new RegExp(`\\b${role}\\s*:\\s*\\[`);
    if (!re.test(navBody)) {
      failures.push(`${file}: STAFF_NAV_BY_ROLE missing entry for role '${role}' -> nav would render empty`);
    }
  }

  // Extract AR and EN dictionaries' role_* keys and confirm each known role
  // resolves via t('role_'+role): i.e. a 'role_<role>' key exists.
  for (const role of KNOWN_ROLES) {
    const key = `role_${role}`;
    // crude check: key literal followed by ':' appears in the file at least twice
    // (once per language block)
    const count = (src.match(new RegExp(`\\b${key}\\s*:`, 'g')) || []).length;
    if (count < 2) {
      failures.push(`${file}: i18n key '${key}' missing or incomplete (found ${count}, need >=2 for AR+EN) -> raw key would leak into UI for role '${role}'`);
    }
  }
}

if (failures.length) {
  console.error('FAIL: nav/role-label regression\n' + failures.map(f => '  - ' + f).join('\n'));
  process.exit(1);
} else {
  console.log('PASS: all known roles have STAFF_NAV_BY_ROLE entries and complete role_* i18n keys (AR+EN) across all 6 files.');
}
