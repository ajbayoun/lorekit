#!/usr/bin/env node
'use strict';

/* Smoke test: init → doctor → sync → add → list in a temp dir. */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BIN = path.join(__dirname, '..', 'bin', 'lore.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lorekit-test-'));

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}
function lore(args, opts = {}) {
  return execFileSync('node', [BIN, ...args], {
    cwd: tmp,
    encoding: 'utf8',
    ...opts,
  });
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log(`smoke test in ${tmp}\n`);

check('init creates core docs', () => {
  fs.writeFileSync(path.join(tmp, 'Dockerfile'), 'FROM node:20\n');
  const out = lore(['init', '--name', 'testproj']);
  assert(fs.existsSync(path.join(tmp, 'AGENTS.md')), 'AGENTS.md missing');
  assert(fs.existsSync(path.join(tmp, 'CLAUDE.md')), 'CLAUDE.md missing');
  assert(fs.existsSync(path.join(tmp, 'lore', 'todo.md')), 'todo.md missing');
  assert(fs.existsSync(path.join(tmp, 'lore', 'deployment.md')), 'Docker detected but deployment.md not auto-added');
  assert(out.includes('testproj'), 'project name not in output');
});

check('AGENTS.md is fully rendered (no leftover {{vars}})', () => {
  const content = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  assert(!/\{\{\w+\}\}/.test(content), 'unrendered placeholder in AGENTS.md');
  assert(content.includes('| Doc |'), 'manifest table missing');
  assert(content.includes('lore/todo.md'), 'todo not in read map');
});

check('init is idempotent (skips existing files)', () => {
  const out = lore(['init']);
  assert(out.includes('skipped'), 'expected skipped files on re-init');
});

check('doctor flags _FILL_ME_ placeholders and exits 1', () => {
  let code = 0;
  try {
    lore(['doctor']);
  } catch (e) {
    code = e.status;
  }
  assert(code === 1, `expected exit 1, got ${code}`);
});

check('sync moves [x] tasks to done.md', () => {
  const todoPath = path.join(tmp, 'lore', 'todo.md');
  let todo = fs.readFileSync(todoPath, 'utf8');
  todo = todo.replace('- [ ] _FILL_ME_ (the first concrete task)', '- [x] ship the smoke test');
  fs.writeFileSync(todoPath, todo);
  const out = lore(['sync']);
  assert(out.includes('ship the smoke test'), 'task not reported as moved');
  const done = fs.readFileSync(path.join(tmp, 'lore', 'done.md'), 'utf8');
  assert(done.includes('ship the smoke test'), 'task not in done.md');
  assert(/## \d{4}-\d{2}-\d{2}/.test(done), 'no date heading in done.md');
  assert(!fs.readFileSync(todoPath, 'utf8').includes('ship the smoke test'), 'task still in todo.md');
});

check('sync with nothing to move is a no-op', () => {
  const out = lore(['sync']);
  assert(out.includes('nothing to sync'), 'expected no-op message');
});

check('add installs a full-tier doc', () => {
  const out = lore(['add', 'security']);
  assert(fs.existsSync(path.join(tmp, 'lore', 'security.md')), 'security.md missing');
  assert(out.includes('created'), 'no created output');
});

check('add rejects unknown docs', () => {
  let code = 0;
  try {
    lore(['add', 'nonsense-doc']);
  } catch (e) {
    code = e.status;
  }
  assert(code === 1, `expected exit 1, got ${code}`);
});

check('list shows installed and available docs', () => {
  const out = lore(['list']);
  assert(out.includes('installed'), 'no installed docs shown');
  assert(out.includes('available'), 'no available docs shown');
});

check('full init installs every doc', () => {
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lorekit-test-full-'));
  execFileSync('node', [BIN, 'init', '--full'], { cwd: tmp2, encoding: 'utf8' });
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'templates', 'manifest.json'), 'utf8')
  ).docs;
  for (const key of Object.keys(manifest)) {
    assert(
      fs.existsSync(path.join(tmp2, 'lore', manifest[key].file)),
      `${manifest[key].file} missing in full init`
    );
  }
  fs.rmSync(tmp2, { recursive: true, force: true });
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n${failures} failure(s)` : '\nall green');
process.exit(failures ? 1 : 0);
