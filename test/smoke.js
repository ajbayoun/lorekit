#!/usr/bin/env node
'use strict';

/* Smoke test: exercises every command end-to-end in temp dirs. */

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
// Like lore(), but tolerates non-zero exit and returns {out, code}.
function loreTry(args, opts = {}) {
  try {
    return { out: lore(args, opts), code: 0 };
  } catch (e) {
    return { out: (e.stdout || '') + (e.stderr || ''), code: e.status };
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function setLastVerified(file, date) {
  const content = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(content ? file : file, content.replace(/last-verified: .*/, `last-verified: ${date}`));
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
  const { out, code } = loreTry(['doctor']);
  assert(code === 1, `expected exit 1, got ${code}`);
  assert(out.includes('_FILL_ME_'), 'placeholders not reported');
});

check('doctor --json emits a machine-readable report', () => {
  const { out, code } = loreTry(['doctor', '--json']);
  assert(code === 1, `expected exit 1, got ${code}`);
  const report = JSON.parse(out);
  assert(report.ok === false, 'ok should be false');
  assert(Array.isArray(report.issues) && report.issues.length > 0, 'issues array empty');
  assert(report.issues.some((i) => i.type === 'placeholders'), 'no placeholders issue in JSON');
  assert(report.stats.scanned > 0, 'stats.scanned missing');
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

check('add installs a doc AND updates the AGENTS.md read map', () => {
  const out = lore(['add', 'security']);
  assert(fs.existsSync(path.join(tmp, 'lore', 'security.md')), 'security.md missing');
  assert(out.includes('read map'), 'no read-map update reported');
  const agents = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  assert(agents.includes('lore/security.md'), 'security.md row not inserted into read map');
});

check('add rejects unknown docs', () => {
  const { code } = loreTry(['add', 'nonsense-doc']);
  assert(code === 1, `expected exit 1, got ${code}`);
});

check('doctor flags stale docs by age when there is no git history', () => {
  setLastVerified(path.join(tmp, 'lore', 'project.md'), '2020-01-01');
  const { out } = loreTry(['doctor']);
  assert(/project\.md\s+stale/.test(out), 'old project.md not flagged stale');
});

check('touch bumps last-verified and clears the staleness', () => {
  lore(['touch', 'project']);
  const content = fs.readFileSync(path.join(tmp, 'lore', 'project.md'), 'utf8');
  const date = new Date().toISOString().slice(0, 10);
  assert(content.includes(`last-verified: ${date}`), 'date not bumped');
  const { out } = loreTry(['doctor']);
  assert(!/\.md\s+stale/.test(out), 'staleness still reported after touch');
});

check('touch rejects unknown docs', () => {
  const { code } = loreTry(['touch', 'nonsense-doc']);
  assert(code === 1, `expected exit 1, got ${code}`);
});

check('doctor flags orphan docs missing from the read map', () => {
  const rogue = path.join(tmp, 'lore', 'scratch.md');
  fs.writeFileSync(rogue, '---\ntitle: Scratch\nlast-verified: 2099-01-01\n---\n# Scratch\n');
  const { out } = loreTry(['doctor']);
  assert(out.includes('read map'), 'orphan doc not flagged');
  fs.rmSync(rogue);
});

check('doctor flags read-map rows whose file is missing', () => {
  fs.rmSync(path.join(tmp, 'lore', 'user-actions.md'));
  const { out } = loreTry(['doctor']);
  assert(out.includes('lore/user-actions.md but the file is missing'), 'dead read-map row not flagged');
  lore(['add', 'user-actions']);
});

check('ci writes a GitHub Actions workflow', () => {
  const out = lore(['ci']);
  const wf = path.join(tmp, '.github', 'workflows', 'lore-doctor.yml');
  assert(fs.existsSync(wf), 'workflow file missing');
  assert(fs.readFileSync(wf, 'utf8').includes('lorekit doctor'), 'workflow does not run doctor');
  assert(out.includes('created'), 'no created output');
});

check('link creates pointer files for other AI tools', () => {
  lore(['link']);
  for (const f of ['GEMINI.md', '.windsurfrules', '.clinerules', path.join('.github', 'copilot-instructions.md')]) {
    const p = path.join(tmp, f);
    assert(fs.existsSync(p), `${f} missing`);
    assert(fs.readFileSync(p, 'utf8').includes('AGENTS.md'), `${f} does not point to AGENTS.md`);
  }
});

check('link rejects unknown tools', () => {
  const { code } = loreTry(['link', 'notepad']);
  assert(code === 1, `expected exit 1, got ${code}`);
});

check('list shows installed and available docs', () => {
  const out = lore(['list']);
  assert(out.includes('installed'), 'no installed docs shown');
  assert(out.includes('available'), 'no available docs shown');
});

check('doctor staleness is git-aware (quiet repos stay quiet)', () => {
  const gtmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lorekit-test-git-'));
  const run = (cmd, args, env = {}) =>
    execFileSync(cmd, args, { cwd: gtmp, encoding: 'utf8', env: { ...process.env, ...env } });
  run('git', ['init', '-q']);
  execFileSync('node', [BIN, 'init'], { cwd: gtmp, encoding: 'utf8' });
  run('git', ['add', '-A']);
  run(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t.local', 'commit', '-q', '-m', 'init'],
    { GIT_AUTHOR_DATE: '2020-06-01T12:00:00', GIT_COMMITTER_DATE: '2020-06-01T12:00:00' }
  );
  // decisions.md: verified AFTER the last commit → old but not stale.
  setLastVerified(path.join(gtmp, 'lore', 'decisions.md'), '2023-01-01');
  // todo.md: verified BEFORE the last commit → stale, with commit count.
  setLastVerified(path.join(gtmp, 'lore', 'todo.md'), '2019-01-01');
  let out;
  try {
    out = execFileSync('node', [BIN, 'doctor'], { cwd: gtmp, encoding: 'utf8' });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  assert(!/decisions\.md\s+stale/.test(out), 'quiet-repo doc wrongly flagged stale');
  assert(/todo\.md\s+stale/.test(out), 'pre-commit doc not flagged stale');
  assert(/commit/.test(out), 'stale message missing commit count');
  fs.rmSync(gtmp, { recursive: true, force: true });
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
