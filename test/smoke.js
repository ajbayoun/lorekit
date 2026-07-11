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
function loreIn(dir, args) {
  return execFileSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' });
}
function loreTryIn(dir, args) {
  try {
    return { out: loreIn(dir, args), code: 0 };
  } catch (e) {
    return { out: (e.stdout || '') + (e.stderr || ''), code: e.status };
  }
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

// ---------- fleet mode ----------

const ftmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lorekit-test-fleet-'));

check('fleet init migrates todo.md into the task system', () => {
  loreIn(ftmp, ['init', '--name', 'fleetproj']);
  const date = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(
    path.join(ftmp, 'lore', 'todo.md'),
    `---\ndoc: todo\ntitle: To-do\nsummary: x\nlast-verified: ${date}\nread-when: x\nupdate-when: x\n---\n\n# To-do\n\n## Now\n- [ ] fix login\n\n## Next\n- [ ] add tests\n\n## Later\n- [ ] polish ui\n- [x] already shipped\n`
  );
  loreIn(ftmp, ['fleet', 'init']);
  assert(fs.existsSync(path.join(ftmp, 'lore', 'tasks', 'done')), 'tasks/done missing');
  assert(fs.existsSync(path.join(ftmp, 'lore', 'sessions')), 'sessions missing');
  assert(fs.existsSync(path.join(ftmp, 'lore', 'fleet.md')), 'fleet.md missing');
  assert(fs.readFileSync(path.join(ftmp, 'AGENTS.md'), 'utf8').includes('lore/fleet.md'), 'fleet.md not in read map');
  const tasks = JSON.parse(loreIn(ftmp, ['task', 'list', '--json']));
  assert(tasks.length === 3, `expected 3 migrated tasks, got ${tasks.length}`);
  assert(tasks.find((t) => t.title === 'fix login').priority === 'high', 'Now section not high priority');
  assert(tasks.find((t) => t.title === 'polish ui').priority === 'low', 'Later section not low priority');
  assert(fs.readFileSync(path.join(ftmp, 'lore', 'done.md'), 'utf8').includes('already shipped'), '[x] item not moved to done.md');
  assert(fs.readFileSync(path.join(ftmp, 'lore', 'todo.md'), 'utf8').includes('fleet mode'), 'todo.md not converted to pointer');
});

check('task add supports zone, priority, and dependencies', () => {
  loreIn(ftmp, ['task', 'add', 'Deploy pipeline', '--zone', 'infra', '--priority', 'high', '--depends', 'T-0001']);
  const tasks = JSON.parse(loreIn(ftmp, ['task', 'list', '--json']));
  const t = tasks.find((x) => x.title === 'Deploy pipeline');
  assert(t && t.zone === 'infra', 'zone not set');
  assert(t.status === 'blocked', `unmet dependency should compute blocked, got ${t.status}`);
});

check('task next picks by priority and claims atomically', () => {
  const next = JSON.parse(loreIn(ftmp, ['task', 'next', '--json']));
  assert(next.id === 'T-0001', `expected high-priority T-0001 first, got ${next.id}`);
  const claimed = JSON.parse(loreIn(ftmp, ['task', 'next', '--claim', '--by', 'agent-a', '--json']));
  assert(claimed.id === 'T-0001' && claimed.claimedBy === 'agent-a', 'claim did not stick');
  const after = JSON.parse(loreIn(ftmp, ['task', 'list', '--json']));
  assert(after.find((t) => t.id === 'T-0001').status === 'claimed', 'status not claimed on disk');
});

check('task next prefers zones without active claims', () => {
  loreIn(ftmp, ['task', 'add', 'Zone test', '--zone', 'quiet']);
  const next = JSON.parse(loreIn(ftmp, ['task', 'next', '--json']));
  assert(next.zone === 'quiet', `expected quiet-zone task to win over busy general zone, got ${next.id} in ${next.zone}`);
});

check('task done moves the file and unblocks dependents', () => {
  loreIn(ftmp, ['task', 'done', 'T-0001']);
  assert(
    fs.readdirSync(path.join(ftmp, 'lore', 'tasks', 'done')).some((f) => f.startsWith('T-0001')),
    'done task not moved to tasks/done/'
  );
  const tasks = JSON.parse(loreIn(ftmp, ['task', 'list', '--json']));
  const dep = tasks.find((t) => t.title === 'Deploy pipeline');
  assert(dep.status === 'open', `dependent should unblock after dependency done, got ${dep.status}`);
});

check('task reopen clears a claim', () => {
  loreIn(ftmp, ['task', 'claim', 'T-0002', '--by', 'agent-b']);
  loreIn(ftmp, ['task', 'reopen', 'T-0002']);
  const tasks = JSON.parse(loreIn(ftmp, ['task', 'list', '--json']));
  const t = tasks.find((x) => x.id === 'T-0002');
  assert(t.status === 'open' && !t.claimedBy, 'reopen did not clear the claim');
});

check('doctor catches stale claims, zone pileups, unknown deps, and cycles', () => {
  loreIn(ftmp, ['task', 'claim', 'T-0002', '--by', 'agent-b']);
  loreIn(ftmp, ['task', 'claim', 'T-0003', '--by', 'agent-c']);
  // Backdate one claim by 48 hours.
  const t2 = fs.readdirSync(path.join(ftmp, 'lore', 'tasks')).find((f) => f.startsWith('T-0002'));
  const t2path = path.join(ftmp, 'lore', 'tasks', t2);
  const old = new Date(Date.now() - 48 * 3600000).toISOString();
  fs.writeFileSync(t2path, fs.readFileSync(t2path, 'utf8').replace(/claimed-at: .*/, `claimed-at: ${old}`));
  loreIn(ftmp, ['task', 'add', 'Ghost dep', '--depends', 'T-9999']);
  // Hand-write a dependency cycle.
  const date = new Date().toISOString().slice(0, 10);
  const mk = (id, dep) =>
    fs.writeFileSync(
      path.join(ftmp, 'lore', 'tasks', `${id}-cycle.md`),
      `---\nid: ${id}\ntitle: cycle ${id}\nstatus: open\npriority: low\nzone: cycles\ndepends-on: ${dep}\ncreated: ${date}\nclaimed-by: \nclaimed-at: \n---\n# ${id}\n`
    );
  mk('T-0900', 'T-0901');
  mk('T-0901', 'T-0900');
  const { out } = loreTryIn(ftmp, ['doctor', '--json']);
  const report = JSON.parse(out);
  const types = report.issues.map((i) => i.type);
  assert(types.includes('task-stale-claim'), 'stale claim not flagged');
  assert(types.includes('task-zone-pileup'), 'zone pileup not flagged');
  assert(types.includes('task-unknown-dep'), 'unknown dependency not flagged');
  assert(types.includes('task-dependency-cycle'), 'dependency cycle not flagged');
  assert(report.stats.tasks && report.stats.tasks.done >= 1, 'task stats missing');
  fs.rmSync(path.join(ftmp, 'lore', 'tasks', 'T-0900-cycle.md'));
  fs.rmSync(path.join(ftmp, 'lore', 'tasks', 'T-0901-cycle.md'));
});

check('sync moves done-status task files to tasks/done/', () => {
  const f = fs.readdirSync(path.join(ftmp, 'lore', 'tasks')).find((x) => x.startsWith('T-0003'));
  const p = path.join(ftmp, 'lore', 'tasks', f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/status: .*/, 'status: done'));
  const out = loreIn(ftmp, ['sync']);
  assert(out.includes('T-0003'), 'done-status task not synced');
  assert(!fs.existsSync(p), 'task file still in active dir');
});

check('playbook add creates a recipe and routes it in the read map', () => {
  loreIn(ftmp, ['playbook', 'add', 'Add API endpoint']);
  const p = path.join(ftmp, 'lore', 'playbooks', 'add-api-endpoint.md');
  assert(fs.existsSync(p), 'playbook file missing');
  assert(fs.readFileSync(p, 'utf8').includes('Add API endpoint'), 'title not rendered');
  assert(fs.readFileSync(path.join(ftmp, 'AGENTS.md'), 'utf8').includes('lore/playbooks/'), 'playbooks not in read map');
  const list = loreIn(ftmp, ['playbook', 'list']);
  assert(list.includes('add-api-endpoint'), 'playbook not listed');
  const { out } = loreTryIn(ftmp, ['doctor']);
  assert(!out.includes('playbooks/add-api-endpoint.md  not in'), 'playbook wrongly flagged as orphan');
});

check('digest prints rules, docs, and the fleet board', () => {
  const out = loreIn(ftmp, ['digest']);
  assert(out.includes('## Rules, short form'), 'rules missing from digest');
  assert(out.includes('lore/architecture.md'), 'docs missing from digest');
  assert(out.includes('## Fleet'), 'fleet board missing from digest');
  assert(out.includes('fleetproj'), 'project name missing from digest');
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

check('full init installs every doc, including ready-to-use guides', () => {
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
  const agents = fs.readFileSync(path.join(tmp2, 'AGENTS.md'), 'utf8');
  assert(agents.includes('lore/guides/ui-ux.md'), 'ui-ux guide not in read map');
  assert(agents.includes('lore/guides/backend.md'), 'backend guide not in read map');
  for (const g of ['ui-ux.md', 'backend.md']) {
    const content = fs.readFileSync(path.join(tmp2, 'lore', 'guides', g), 'utf8');
    assert(!/(?<!`)_FILL_ME_(?!`)/.test(content), `${g} ships with placeholders — guides must be ready to use`);
  }
  fs.rmSync(tmp2, { recursive: true, force: true });
});

fs.rmSync(ftmp, { recursive: true, force: true });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n${failures} failure(s)` : '\nall green');
process.exit(failures ? 1 : 0);
