// Regression test: GET /api/prearrival must only ever be requested by the
// roles the backend itself allows (routes-prearrival.js
// requireReceptionOrAbove): owner, manager, and dept_manager/staff whose
// department is 'reception'. Every other dept_manager/staff (dining,
// housekeeping, maintenance, laundry, concierge, spa, taxi, entertainment,
// billing) must NEVER trigger the network call - not a try/catch on a 403,
// the request must not be sent - and refreshOpsData's Promise.all must still
// resolve (the skipped branch stays Promise.resolve([])) so the rest of the
// screen (requests, feedback) keeps loading with no error surfaced to the
// user. Added for Frontend item #194.
const fs = require('fs');

const FILES = ['index.html','guest.html','staff.html','owner.html','manager.html','team.html'];
const ALL_DEPARTMENTS = ['reception','dining','housekeeping','maintenance','laundry','concierge','spa','taxi','entertainment','billing'];

// role is the *frontend* role after the login-time mapping (see routes-users
// login handler in each file: backend dept_manager/staff -> frontend 'dept').
const CASES = [
  { role: 'owner',   dept: null, shouldCall: true,  label: 'owner' },
  { role: 'manager', dept: null, shouldCall: true,  label: 'manager' },
  { role: 'dept',    dept: 'reception', shouldCall: true, label: 'dept_manager/staff (reception)' },
  ...ALL_DEPARTMENTS.filter(d => d !== 'reception').map(d => ({
    role: 'dept', dept: d, shouldCall: false, label: `dept_manager/staff (${d})`,
  })),
  { role: 'dept', dept: null, shouldCall: false, label: 'dept_manager/staff (no department set)' },
];

let failures = [];

for (const file of FILES) {
  const src = fs.readFileSync(file, 'utf8');

  const lineMatch = src.match(/^\s*(.+?)\?\s*apiCall\('\/api\/prearrival', \{token\}\) : (Promise\.resolve\(\[\]\)),?\s*$/m);
  if (!lineMatch) {
    failures.push(`${file}: could not locate the prearrival gating line inside refreshOpsData - has the call been moved or its shape changed?`);
    continue;
  }
  const condSrc = lineMatch[1].trim();
  const fallbackSrc = lineMatch[2].trim();

  if (fallbackSrc !== 'Promise.resolve([])') {
    failures.push(`${file}: skipped branch is '${fallbackSrc}', not 'Promise.resolve([])' - Promise.all would reject or return the wrong shape for disallowed roles`);
  }

  let cond;
  try {
    // eslint-disable-next-line no-new-func
    cond = new Function('S', `return (${condSrc});`);
  } catch (e) {
    failures.push(`${file}: gating expression '${condSrc}' failed to parse: ${e.message}`);
    continue;
  }

  for (const c of CASES) {
    const S = { staff: { role: c.role, dept: c.dept } };
    let result;
    try {
      result = !!cond(S);
    } catch (e) {
      failures.push(`${file}: gating expression threw for ${c.label}: ${e.message}`);
      continue;
    }
    if (result !== c.shouldCall) {
      failures.push(`${file}: role='${c.role}' dept='${c.dept}' (${c.label}) -> expected shouldCall=${c.shouldCall}, condition evaluated to ${result}`);
    }
  }

  if (!/apiCall\('\/api\/requests', \{token\}\)/.test(src)) {
    failures.push(`${file}: unconditional '/api/requests' call inside refreshOpsData is missing`);
  }
  if (!/\(S\.staff\.role!=='dept'\) \? apiCall\('\/api\/feedback', \{token\}\) : Promise\.resolve\(\[\]\)/.test(src)) {
    failures.push(`${file}: '/api/feedback' gating line changed unexpectedly (should remain role-only, unrelated to this fix)`);
  }
}

if (failures.length) {
  console.error('FAIL: prearrival department-gating regression\n' + failures.map(f => '  - ' + f).join('\n'));
  process.exit(1);
} else {
  console.log('PASS: /api/prearrival is requested only for owner, manager, and reception dept_manager/staff across all 6 files; every other department never calls it, and refreshOpsData\'s Promise.all (requests/feedback) stays intact.');
}
