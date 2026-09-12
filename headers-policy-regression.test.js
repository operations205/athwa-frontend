// Security-headers regression test.
//
// `_headers` on every branch used to name only the staging backend in
// connect-src. Staging served that; production served the production backend
// from a Render dashboard rule instead. The committed file was therefore wrong
// for production, and recreating that static site from the repository would
// have shipped a CSP that blocks every API call the app makes.
//
// The invariant worth protecting is not a literal string, it is the
// relationship: EVERY backend origin the app can choose at runtime (the
// API_BASE hostname map inside the HTML) must be permitted by connect-src.
// This test derives one from the other, so adding a custom domain to the app
// without updating the policy fails here rather than in production.
//
// Run with: node headers-policy-regression.test.js
'use strict';
const fs = require('fs');

const FILES = ['index.html', 'guest.html', 'staff.html', 'owner.html', 'manager.html', 'team.html'];
const failures = [];

const headers = fs.readFileSync('_headers', 'utf8');

// --- parse the policy -------------------------------------------------------
const cspLine = headers.split(/\r?\n/).find((l) => /^\s*Content-Security-Policy:/i.test(l));
if (!cspLine) {
  console.error('FAIL: _headers has no Content-Security-Policy line');
  process.exit(1);
}
const csp = cspLine.replace(/^\s*Content-Security-Policy:\s*/i, '');
const directives = {};
for (const part of csp.split(';')) {
  const tokens = part.trim().split(/\s+/).filter(Boolean);
  if (tokens.length) directives[tokens[0]] = tokens.slice(1);
}

const connectSrc = directives['connect-src'] || [];
if (!connectSrc.length) failures.push('connect-src is missing or empty');

// --- the directives that must not quietly weaken ----------------------------
const REQUIRED = {
  'default-src': "'self'",
  'frame-ancestors': "'none'",
  'object-src': "'none'",
  'base-uri': "'self'",
  'form-action': "'self'",
};
for (const [name, expected] of Object.entries(REQUIRED)) {
  const actual = (directives[name] || []).join(' ');
  if (actual !== expected) {
    failures.push(`CSP ${name} is "${actual || '(absent)'}", expected "${expected}"`);
  }
}

// --- every runtime backend must be allowed by the policy --------------------
// API_BASE maps location.hostname -> backend origin, plus a default fallback.
const src = fs.readFileSync(FILES[0], 'utf8');
const apiBaseBlock = src.slice(src.indexOf('const API_BASE'), src.indexOf('const API_BASE') + 800);
const runtimeOrigins = [...new Set(
  (apiBaseBlock.match(/https:\/\/[a-z0-9.-]+\.onrender\.com/g) || [])
)];

if (runtimeOrigins.length === 0) {
  failures.push('could not find any backend origin in the API_BASE map - has it been restructured?');
}
for (const origin of runtimeOrigins) {
  if (!connectSrc.includes(origin)) {
    failures.push(`API_BASE can select ${origin}, but connect-src does not allow it - that environment would be fully broken`);
  }
}

// --- the six files must agree on which backends exist -----------------------
for (const file of FILES.slice(1)) {
  const other = fs.readFileSync(file, 'utf8');
  const block = other.slice(other.indexOf('const API_BASE'), other.indexOf('const API_BASE') + 800);
  const origins = [...new Set((block.match(/https:\/\/[a-z0-9.-]+\.onrender\.com/g) || []))];
  if (origins.join(',') !== runtimeOrigins.join(',')) {
    failures.push(`${file} has a different API_BASE backend set (${origins.join(', ')}) than ${FILES[0]} (${runtimeOrigins.join(', ')})`);
  }
}

// --- other headers ----------------------------------------------------------
for (const [name, expected] of [
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
]) {
  const re = new RegExp('^\\s*' + name + ':\\s*' + expected + '\\s*$', 'im');
  if (!re.test(headers)) failures.push(`_headers is missing "${name}: ${expected}"`);
}

if (failures.length) {
  console.error('FAIL: headers-policy regression\n' + failures.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
} else {
  console.log(
    `PASS: CSP permits every backend the app can select (${runtimeOrigins.join(', ')}), ` +
    'the hardening directives are intact, and all 6 files agree on the backend set.'
  );
}
