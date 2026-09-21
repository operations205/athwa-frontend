'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const pages = ['index.html', 'guest.html', 'staff.html', 'owner.html', 'manager.html', 'team.html'];

for (const page of pages) {
  const source = fs.readFileSync(page, 'utf8');
  const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.strictEqual(scripts.length, 1, `${page}: expected exactly one inline application script`);
  assert.doesNotThrow(
    () => new vm.Script(scripts[0][1], { filename: `${page}:inline-script` }),
    `${page}: inline application script must compile`
  );
}

console.log(`PASS: inline application JavaScript compiles in all ${pages.length} pages.`);
