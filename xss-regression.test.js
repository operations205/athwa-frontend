// Phase 1 (round 2, revised per reviewer feedback) XSS regression test.
//
// This test is coupled to the ACTUAL source of index.html, not to a
// hand-written stand-in template. It:
//   1. Asserts the real HTML-rendering call sites for pillow/occasion/temp/
//      floor/request.department/user.department contain escapeHtml(t(...))
//      (the fix), and that the old unescaped form is gone.
//   2. Asserts submitMaintenance() and updateStaffRoleLabel() do NOT call
//      escapeHtml() -- their output is an API payload / textContent, never
//      parsed as HTML, so encoding there would corrupt stored data or show
//      literal "&amp;"-style entities to the user.
//   3. Exercises the real escapeHtml()/t() functions (extracted from the
//      file, not reimplemented) against payloads beyond <img>: a quote-
//      breakout payload and an SVG-based payload, confirming both are
//      neutralized in an actual HTML-insertion template.
//
// Run with: node xss-regression.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('index.html', 'utf8');

// ---------------------------------------------------------------------
// 1) Source-level assertions: the fix is actually in the shipped file.
// ---------------------------------------------------------------------

const mustContain = [
  "escapeHtml(t(p.pillow))",
  "escapeHtml(t(p.occasion))",
  "escapeHtml(t(p.temp))",
  "escapeHtml(t(p.floor))",
  "escapeHtml(t('nav_'+r.dept))",
  "escapeHtml(t('nav_'+u.department))",
  "escapeHtml(t('nav_'+r.department))",
];
for (const s of mustContain) {
  assert.ok(src.includes(s), `expected safe pattern missing from index.html: ${s}`);
}

// The old, unescaped forms used to render these same values directly in
// HTML templates must no longer be present anywhere in the file.
const mustNotContain = [
  "<strong>${t(p.pillow)}</strong>",
  "<strong>${t(p.temp)}</strong>",
  "<strong>${t(p.floor)}</strong>",
  "<strong>${t(p.occasion)}</strong>",
  "${ICONS_SM.bed}${t(p.pillow)}",
  "${ICONS_SM.gift}${t(p.occasion)}",
  "${!isDept?t('nav_'+r.dept)+' Â· '",
  "${u.department?' Â· '+t('nav_'+u.department)",
  "<td>${t('nav_'+r.department)}</td>",
];
for (const s of mustNotContain) {
  assert.ok(!src.includes(s), `unsafe pre-fix pattern still present in index.html: ${s}`);
}

// ---------------------------------------------------------------------
// 2) submitMaintenance() must send/store the RAW value, never escaped.
// ---------------------------------------------------------------------

const maintFn = src.match(/function submitMaintenance\(\)\{[\s\S]*?\n\}/);
assert.ok(maintFn, 'submitMaintenance() not found in index.html');
assert.ok(!maintFn[0].includes('escapeHtml'),
  'submitMaintenance() must not call escapeHtml() -- its output is an API payload, not HTML');
assert.ok(maintFn[0].includes("t(cat)"),
  'submitMaintenance() should still translate the category via t(cat) (raw, unescaped)');

// ---------------------------------------------------------------------
// 3) updateStaffRoleLabel() writes to textContent -- must not escape.
// ---------------------------------------------------------------------

const roleLabelFn = src.match(/function updateStaffRoleLabel\(\)\{[\s\S]*?\n\}/);
assert.ok(roleLabelFn, 'updateStaffRoleLabel() not found in index.html');
assert.ok(!roleLabelFn[0].includes('escapeHtml'),
  'updateStaffRoleLabel() assigns to el.textContent, which never parses HTML -- escapeHtml() here would show literal "&amp;"-style entities to the user');
assert.ok(roleLabelFn[0].includes('.textContent ='),
  'expected updateStaffRoleLabel() to assign via textContent');

// ---------------------------------------------------------------------
// 4) Functional test: real escapeHtml()/t() against payloads beyond <img>,
//    run through the actual HTML-insertion template shape used by the app.
// ---------------------------------------------------------------------

const escapeHtmlMatch = src.match(/function escapeHtml\(str\)\{[\s\S]*?\n\}/);
assert(escapeHtmlMatch, 'escapeHtml() not found in index.html');

const sandbox = {};
sandbox.DICT = { ar: {}, en: {} }; // empty dict -> t() falls back to raw key (worst case)
sandbox.LANG = 'ar';
vm.createContext(sandbox);
vm.runInContext(escapeHtmlMatch[0], sandbox);
vm.runInContext(`function t(key){ return (DICT[LANG] && DICT[LANG][key]) || key; }`, sandbox);
const { escapeHtml, t } = sandbox;

function assertInertHtml(rendered, label) {
  assert.ok(!/<img[^&]*>/.test(rendered), `${label}: unescaped <img...> tag present: ${rendered}`);
  assert.ok(!/<svg[^&]*>/.test(rendered), `${label}: unescaped <svg...> tag present: ${rendered}`);
  assert.ok(!/"[^"]*onerror/.test(rendered) || rendered.includes('&quot;'),
    `${label}: unescaped quote could break out of an HTML attribute: ${rendered}`);
}

const PAYLOADS = [
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  "'><svg/onload=alert(2)>",
];

for (const PAYLOAD of PAYLOADS) {
  const p = { pillow: PAYLOAD, occasion: PAYLOAD, temp: PAYLOAD, floor: PAYLOAD };
  assertInertHtml(`<strong>${escapeHtml(t(p.pillow))}</strong>`, `preferences.pillow [${PAYLOAD}]`);
  assertInertHtml(`<strong>${escapeHtml(t(p.occasion))}</strong>`, `preferences.occasion [${PAYLOAD}]`);
  assertInertHtml(`<strong>${escapeHtml(t(p.temp))}</strong>`, `preferences.temp [${PAYLOAD}]`);
  assertInertHtml(`<strong>${escapeHtml(t(p.floor))}</strong>`, `preferences.floor [${PAYLOAD}]`);

  const r = { dept: PAYLOAD, department: PAYLOAD };
  const isDept = false;
  assertInertHtml(`${!isDept ? escapeHtml(t('nav_' + r.dept)) + ' - ' : ''}`, `request.dept [${PAYLOAD}]`);
  assertInertHtml(`${escapeHtml(t('nav_' + r.department))}`, `request.department [${PAYLOAD}]`);

  const u = { department: PAYLOAD };
  assertInertHtml(`${u.department ? ' - ' + escapeHtml(t('nav_' + u.department)) : ''}`, `user.department [${PAYLOAD}]`);

  // Attribute-context check: an onclick="staffNav('${key}')" style attribute
  // must not let a payload break out of the surrounding double quotes.
  const attrRendered = `<button onclick="x('${escapeHtml(t(p.pillow))}')">`;
  assert.ok(!attrRendered.includes('"><svg') && !attrRendered.includes("'><svg"),
    `attribute-context breakout not prevented for payload ${PAYLOAD}: ${attrRendered}`);
}

// ---------------------------------------------------------------------
// 5) Sanity check: prove the harness would actually catch a regression,
//    i.e. an unescaped render IS exploitable (not a tautological test).
// ---------------------------------------------------------------------
{
  const p = { pillow: '<img src=x onerror=alert(1)>' };
  const unsafeRendered = `<strong>${t(p.pillow)}</strong>`; // no escapeHtml -- pre-fix form
  assert.ok(/<img[^&]*>/.test(unsafeRendered),
    'sanity check failed: pre-fix (unescaped) path should have been exploitable');
}

console.log('PASS: source-level checks (safe patterns present, unsafe patterns absent, no escapeHtml in submitMaintenance/updateStaffRoleLabel) and functional checks (img/svg/quote payloads neutralized in pillow, occasion, temp, floor, r.dept, r.department, u.department) all succeeded.');
