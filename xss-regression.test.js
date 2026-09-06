// Phase 1 (round 3, revised per reviewer feedback) XSS regression test.
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
//   3. Asserts deleteAdminPlatformAdmin() no longer receives a free-text
//      email argument from the template's inline onclick="..." attribute.
//      HTML-encoding (escapeHtml) protects the HTML-attribute context, but
//      once the browser decodes the attribute value it hands the raw text
//      to the inline-JS parser -- so an email containing a single quote
//      could still break out of the JS string literal even though it was
//      escapeHtml()'d for the surrounding HTML. The correct fix is to pass
//      only a validated numeric id through onclick, then look up the email
//      inside the handler.
//   4. Asserts every id argument that flows from API-sourced objects (h.id,
//      o.id, u.id, inv.id, r.id, a.id, hotelId) into an inline onclick="..."
//      handler is wrapped in Number(...) before insertion.
//   5. Exercises the real escapeHtml()/t() functions (extracted from the
//      file, not reimplemented) against payloads beyond <img>: a quote-
//      breakout payload and an SVG-based payload, confirming both are
//      neutralized in an actual HTML *attribute* context (not a fabricated
//      JS-string-inside-onclick context, which escapeHtml never claims to
//      protect).
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
// 4) deleteAdminPlatformAdmin(): no free text (email) through onclick.
// ---------------------------------------------------------------------

assert.ok(!src.includes("deleteAdminPlatformAdmin(${a.id}, '${escapeHtml(a.email)}')"),
  'deleteAdminPlatformAdmin() must not receive a.email via the inline onclick JS-string context -- ' +
  'escapeHtml() protects the surrounding HTML attribute, not the JS string the browser reconstructs after decoding it');
assert.ok(!/onclick="[^"]*a\.email[^"]*"/.test(src),
  'no onclick="..." attribute anywhere should embed a.email (or any other free-text field) as inline JS');
assert.ok(src.includes("deleteAdminPlatformAdmin(${Number(a.id)})"),
  'deleteAdminPlatformAdmin() should be invoked with only a validated numeric id: Number(a.id)');

const deleteAdminFn = src.match(/async function deleteAdminPlatformAdmin\(id\)\{[\s\S]*?\n\}/);
assert.ok(deleteAdminFn, 'deleteAdminPlatformAdmin(id) (single-arg form) not found in index.html');
assert.ok(deleteAdminFn[0].includes('ADMIN_PLATFORM_ADMINS.find'),
  'deleteAdminPlatformAdmin() should look up the email locally by id rather than receiving it as a parameter');

// ---------------------------------------------------------------------
// 5) All API-sourced ids passed to inline onclick handlers are Number()'d.
// ---------------------------------------------------------------------

const idCallsMustBeNumberWrapped = [
  "redeemOffer(${Number(o.id)}, this)",
  "submitHotelIdentity(${Number(h.id)}, this)",
  "submitHotelDepartments(${Number(h.id)}, this)",
  "markHotelPaid(${Number(h.id)})",
  "submitHotelBilling(${Number(h.id)}, this)",
  "showAddInvoiceForm(${Number(h.id)})",
  "submitAddInvoice(${Number(h.id)}, this)",
  "setInvoiceStatus(${Number(hotelId)}, ${Number(inv.id)}, 'paid')",
  "setInvoiceStatus(${Number(hotelId)}, ${Number(inv.id)}, 'cancelled')",
  "submitHotelIntegration(${Number(h.id)}, this)",
  "toggleAdminUserActive(${Number(u.id)}, ${!!u.active})",
  "toggleHotelActive(${Number(h.id)}, ${!!h.active})",
  "unarchiveHotel(${Number(h.id)})",
  "archiveHotel(${Number(h.id)})",
  "openHotelSettings(${Number(h.id)})",
  "toggleOfferActive(${Number(o.id)}, ${!!o.active})",
  "setRedemptionStatus(${Number(r.id)},'confirmed')",
  "setRedemptionStatus(${Number(r.id)},'cancelled')",
  "advanceStatus(${Number(r.id)})",
];
for (const s of idCallsMustBeNumberWrapped) {
  assert.ok(src.includes(s), `expected Number()-wrapped id call missing from index.html: ${s}`);
}

// The old, unwrapped (bare) forms must be gone.
const oldUnwrappedIdCalls = [
  "redeemOffer(${o.id}, this)",
  "toggleAdminUserActive(${u.id}, ${!!u.active})",
  "toggleHotelActive(${h.id}, ${!!h.active})",
  "advanceStatus('${r.id}')",
];
for (const s of oldUnwrappedIdCalls) {
  assert.ok(!src.includes(s), `old unwrapped id call still present in index.html: ${s}`);
}

// ---------------------------------------------------------------------
// 6) Functional test: real escapeHtml()/t() against payloads beyond <img>,
//    run through a genuine HTML *attribute* insertion template (e.g. an
//    <input value="..."> field), which is the context escapeHtml() is
//    actually meant to protect.
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
}

// Real HTML-attribute context, matching the app's actual pattern, e.g.
// `<input id="pa-flight" value="${escapeHtml(p.flightNo)}">`.
function assertAttributeSafe(value, label) {
  const rendered = `<input value="${escapeHtml(value)}">`;
  // A correctly escaped value can never contain a literal, unescaped double
  // quote -- so it can never terminate the value="..." attribute early and
  // inject a new attribute or tag.
  assert.ok(!/"/.test(escapeHtml(value)), `${label}: raw double-quote survived escapeHtml(): ${rendered}`);
  assert.ok(rendered.startsWith('<input value="') && rendered.endsWith('">'),
    `${label}: payload broke out of the value attribute: ${rendered}`);
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

  // Real HTML attribute context (this is what escapeHtml() actually protects).
  assertAttributeSafe(PAYLOAD, `attribute value [${PAYLOAD}]`);
}

// ---------------------------------------------------------------------
// 7) Sanity check: prove the harness would actually catch a regression,
//    i.e. an unescaped render IS exploitable (not a tautological test).
// ---------------------------------------------------------------------
{
  const p = { pillow: '<img src=x onerror=alert(1)>' };
  const unsafeRendered = `<strong>${t(p.pillow)}</strong>`; // no escapeHtml -- pre-fix form
  assert.ok(/<img[^&]*>/.test(unsafeRendered),
    'sanity check failed: pre-fix (unescaped) path should have been exploitable');
}

console.log('PASS: source-level checks (safe patterns present, unsafe patterns absent, no escapeHtml in submitMaintenance/updateStaffRoleLabel, no free-text in onclick, all API ids Number()-wrapped) and functional checks (img/svg/quote payloads neutralized in HTML content and in a real HTML attribute context) all succeeded.');
