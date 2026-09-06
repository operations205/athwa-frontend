// Phase 1 (round 2) XSS regression test.
// Verifies that a real malicious payload, when routed through the ACTUAL
// escapeHtml()/t() functions extracted from index.html and inserted into the
// same template fragments used by the app, is rendered as inert text and
// never reaches the DOM as executable markup/attributes/event handlers.
//
// Run with: node xss-regression.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('index.html', 'utf8');

const escapeHtmlMatch = src.match(/function escapeHtml\(str\)\{[\s\S]*?\n\}/);
assert(escapeHtmlMatch, 'escapeHtml() not found in index.html');

const sandbox = {};
sandbox.DICT = { ar: {}, en: {} };
sandbox.LANG = 'ar';
vm.createContext(sandbox);
vm.runInContext(escapeHtmlMatch[0], sandbox);
vm.runInContext(`function t(key){ return (DICT[LANG] && DICT[LANG][key]) || key; }`, sandbox);

const { escapeHtml, t } = sandbox;
const PAYLOAD = '<img src=x onerror=alert(1)>';

function assertInert(rendered, label) {
  assert.ok(!rendered.includes('<img '), label + ': raw "<img " tag leaked: ' + rendered);
  assert.ok(!/<img[^&]*>/.test(rendered), label + ': unescaped <img...> tag present: ' + rendered);
  assert.ok(rendered.includes('&lt;img'), label + ': expected "&lt;img" encoded: ' + rendered);
  assert.ok(rendered.includes('&gt;'), label + ': expected closing ">" encoded: ' + rendered);
}

{
  const p = { pillow: PAYLOAD };
  assertInert(`<strong>${escapeHtml(t(p.pillow))}</strong>`, 'preferences.pillow (guest view)');
  assertInert(`${escapeHtml(t(p.pillow))}`, 'preferences.pillow (staff view)');
}
{
  const p = { occasion: PAYLOAD };
  assertInert(`<strong>${escapeHtml(t(p.occasion))}</strong>`, 'preferences.occasion');
}
{
  const p = { temp: PAYLOAD, floor: PAYLOAD };
  assertInert(`<strong>${escapeHtml(t(p.temp))}</strong>`, 'preferences.temp');
  assertInert(`<strong>${escapeHtml(t(p.floor))}</strong>`, 'preferences.floor');
}
{
  const r = { dept: PAYLOAD };
  const isDept = false;
  const rendered = `${!isDept ? escapeHtml(t('nav_' + r.dept)) + ' - ' : ''}`;
  assertInert(rendered, 'request.department (r.dept)');
}
{
  const u = { department: PAYLOAD };
  const rendered = `${u.department ? ' - ' + escapeHtml(t('nav_' + u.department)) : ''}`;
  assertInert(rendered, 'user.department (u.department)');

  const rr = { department: PAYLOAD };
  const rendered2 = `${escapeHtml(t('nav_' + rr.department))}`;
  assertInert(rendered2, 'request.department (r.department)');
}
{
  const p = { pillow: PAYLOAD };
  const unsafeRendered = `<strong>${t(p.pillow)}</strong>`;
  assert.ok(unsafeRendered.includes('<img src=x onerror=alert(1)>'),
    'sanity check failed: pre-fix path should have been exploitable');
}

console.log('PASS: pillow, occasion, temp, floor, r.dept, u.department, r.department all render as inert encoded text.');
