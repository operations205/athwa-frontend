// Polling-cadence regression test.
//
// The staff dashboard used to poll on a fixed 6-second interval that ran even
// while the tab was hidden. At 3 API calls per cycle that is ~450 requests per
// 15 minutes per client, and since every device in a hotel leaves through one
// NAT address, about three colleagues were enough to exhaust the property's
// shared rate-limit budget and start 429-ing each other.
//
// This test pins the fix across all six shared app files:
//   1. The cadence constant exists and is no faster than 20s.
//   2. The old unconditional 6s interval is gone.
//   3. The interval callback is guarded by document.hidden, so a hidden tab
//      issues no requests at all.
//   4. A visibilitychange listener refreshes once on return, so pausing never
//      leaves someone looking at stale data.
//   5. refreshOpsData itself is untouched - the department gating from #194
//      still decides WHICH calls go out (that rule has its own test).
//
// Run with: node polling-cadence-regression.test.js
'use strict';
const fs = require('fs');

const FILES = ['index.html', 'guest.html', 'staff.html', 'owner.html', 'manager.html', 'team.html'];
const MIN_INTERVAL_MS = 20000;

const failures = [];

for (const file of FILES) {
  const src = fs.readFileSync(file, 'utf8');

  // 1) Cadence constant present, and not tightened back below the floor.
  const m = src.match(/const LIVE_POLL_MS = (\d+);/);
  if (!m) {
    failures.push(`${file}: LIVE_POLL_MS constant missing`);
  } else if (Number(m[1]) < MIN_INTERVAL_MS) {
    failures.push(`${file}: LIVE_POLL_MS is ${m[1]}ms, below the ${MIN_INTERVAL_MS}ms floor`);
  }

  // 2) The original always-on 6s interval must not come back.
  if (/setInterval\(refreshOpsData,\s*6000\)/.test(src)) {
    failures.push(`${file}: the unconditional 6s setInterval(refreshOpsData, 6000) has been reintroduced`);
  }

  // 3) The polling callback must not fire for a hidden tab.
  if (!/setInterval\(function\(\)\{\s*[\r\n]+\s*if\(!document\.hidden\) refreshOpsData\(\);/.test(src)) {
    failures.push(`${file}: the polling interval is no longer guarded by !document.hidden`);
  }

  // 4) Returning to the tab must refresh immediately rather than waiting.
  if (!src.includes("document.addEventListener('visibilitychange'")) {
    failures.push(`${file}: visibilitychange listener missing - a resumed tab would show stale data`);
  }
  if (!/if\(!document\.hidden && REFRESH_TIMER\) refreshOpsData\(\);/.test(src)) {
    failures.push(`${file}: visibilitychange handler does not refresh on return (or is not guarded by REFRESH_TIMER)`);
  }

  // 5) The listener is registered once, not re-added on every login.
  if (!src.includes('window.__athwaVisibilityHooked')) {
    failures.push(`${file}: visibilitychange listener is not guarded against duplicate registration`);
  }

  // 6) The #194 department gating inside refreshOpsData must be untouched.
  if (!/\(S\.staff\.role!=='dept' \|\| S\.staff\.dept==='reception'\) \? apiCall\('\/api\/prearrival', \{token\}\)/.test(src)) {
    failures.push(`${file}: the #194 prearrival department gate is missing from refreshOpsData`);
  }
}

if (failures.length) {
  console.error('FAIL: polling-cadence regression\n' + failures.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
} else {
  console.log(
    `PASS: polling is ${MIN_INTERVAL_MS / 1000}s+, paused while hidden, refreshed on return, ` +
    'and the #194 department gate is intact, across all 6 files.'
  );
}
