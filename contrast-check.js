#!/usr/bin/env node
/**
 * contrast-check.js
 * Dependency-free WCAG 2.x contrast-ratio checker for ATHWA core design tokens.
 * Usage: node contrast-check.js
 * Exits 1 if any required pair fails its minimum ratio.
 */

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function channelLum(c) {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function lum(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
}

function contrast(hex1, hex2) {
  const l1 = lum(hex1);
  const l2 = lum(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const pairs = [
  ['text on bg (body copy)', '#171B23', '#F6F2EE', 4.5],
  ['gold-text on panel (hotel_name / forgot-password link)', '#8A642F', '#FFFDFC', 4.5],
  ['gold-text on bg', '#8A642F', '#F6F2EE', 4.5],
  ['warn-text on warn-bg (pill.warn)', '#7A4B00', '#FFF1D0', 4.5],
  ['gold-text on bg (rating-stars / feedback stars, large text)', '#8A642F', '#F6F2EE', 3.0],
  ['gold-text on panel (focus-visible outline, UI indicator)', '#8A642F', '#FFFDFC', 3.0],
  ['logo navy on panel (topbar light lockup)', '#010817', '#FFFDFC', 4.5],
  ['logo ivory on navy (login dark lockup)', '#F6F2EE', '#010817', 4.5],
  ['logo gold accent on navy (login dark lockup, decorative brand mark)', '#C6A174', '#010817', null],
  ['danger on bg', '#9E3B3B', '#F6F2EE', 4.5],
];

let hasFailure = false;
console.log('WCAG Contrast Check - ATHWA design tokens\n');
for (const [label, fg, bg, min] of pairs) {
  const ratio = contrast(fg, bg);
  const ratioStr = ratio.toFixed(2) + ':1';
  if (min === null) {
    console.log(`INFO  ${label}: ${fg} on ${bg} = ${ratioStr} (decorative/logo, WCAG 1.4.11 exception, no minimum enforced)`);
    continue;
  }
  const pass = ratio >= min;
  if (!pass) hasFailure = true;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}: ${fg} on ${bg} = ${ratioStr} (min ${min}:1)`);
}

console.log('');
if (hasFailure) {
  console.log('RESULT: One or more required pairs FAILED minimum contrast.');
  process.exit(1);
} else {
  console.log('RESULT: All required pairs PASS.');
  process.exit(0);
}
