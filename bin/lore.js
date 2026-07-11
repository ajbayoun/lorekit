#!/usr/bin/env node
'use strict';

/*
 * lore — give your repo a memory.
 * Scaffolds and maintains the markdown docs AI agents read, follow,
 * and keep up to date. Fleet mode coordinates many agents on one repo.
 * No dependencies, Node >= 16.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PKG = require(path.join(__dirname, '..', 'package.json'));
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(TEMPLATES_DIR, 'manifest.json'), 'utf8')
).docs;

const LORE_DIR = 'lore';
const FILL_MARKER = '_FILL_ME_';
const DEFAULT_MAX_AGE_DAYS = 30;
const DEFAULT_CLAIM_AGE_HOURS = 24;

// Collection dirs hold one file per item (tasks, session notes) — they are
// exempt from the frontmatter/staleness contract that knowledge docs follow.
const COLLECTION_DIRS = ['tasks', 'sessions'];
const PRIORITIES = ['high', 'normal', 'low'];

const LINK_TOOLS = {
  copilot: path.join('.github', 'copilot-instructions.md'),
  gemini: 'GEMINI.md',
  windsurf: '.windsurfrules',
  cline: '.clinerules',
};

// ---------- small helpers ----------

const useColor = !!process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  green: paint('32'),
  yellow: paint('33'),
  red: paint('31'),
  dim: paint('2'),
  bold: paint('1'),
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readTemplate(relPath) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, relPath), 'utf8');
}

function parseFrontmatter(content) {
  const fm = {};
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return fm;
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return fm;
}

function setFrontmatter(content, updates) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const lines = m[1].split('\n');
  for (const [key, value] of Object.entries(updates)) {
    const idx = lines.findIndex((l) => l.startsWith(key + ':'));
    const line = `${key}: ${value}`;
    if (idx !== -1) lines[idx] = line;
    else lines.push(line);
  }
  return content.replace(m[0], `---\n${lines.join('\n')}\n---`);
}

function render(content, vars) {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? vars[key] : `{{${key}}}`
  );
}

function slugify(s) {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) ||
    'item'
  );
}

const FLAGS_WITH_VALUE = new Set([
  '--zone', '--priority', '--depends', '--desc', '--by',
  '--max-age', '--claim-age', '--name', '--status',
]);

function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : null;
}

function positionals(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (FLAGS_WITH_VALUE.has(a)) { i++; continue; }
    if (a.startsWith('--')) continue;
    out.push(a);
  }
  return out;
}

function detectStack(dir) {
  const hints = [
    ['package.json', 'Node.js'],
    ['tsconfig.json', 'TypeScript'],
    ['pyproject.toml', 'Python'],
    ['requirements.txt', 'Python'],
    ['go.mod', 'Go'],
    ['Cargo.toml', 'Rust'],
    ['Gemfile', 'Ruby'],
    ['pom.xml', 'Java (Maven)'],
    ['build.gradle', 'JVM (Gradle)'],
    ['Dockerfile', 'Docker'],
    ['docker-compose.yml', 'Docker Compose'],
    ['compose.yaml', 'Docker Compose'],
    [path.join('.github', 'workflows'), 'GitHub Actions'],
  ];
  const found = [];
  for (const [file, label] of hints) {
    if (fs.existsSync(path.join(dir, file)) && !found.includes(label)) {
      found.push(label);
    }
  }
  return found;
}

function installedDocPath(cwd, key) {
  return path.join(cwd, LORE_DIR, MANIFEST[key].file);
}

function walkMd(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMd(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// Knowledge docs: everything under lore/ except collection dirs.
function listDocFiles(cwd) {
  const loreDir = path.join(cwd, LORE_DIR);
  return walkMd(loreDir).filter((f) => {
    const top = path.relative(loreDir, f).split(path.sep)[0];
    return !COLLECTION_DIRS.includes(top);
  });
}

function loreRel(cwd, file) {
  return path.relative(path.join(cwd, LORE_DIR), file).split(path.sep).join('/');
}

// ---------- git helpers ----------

function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function gitLastCommitDate(cwd) {
  return git(cwd, ['log', '-1', '--format=%cI']);
}

function gitCommitsSince(cwd, isoDate) {
  const out = git(cwd, ['rev-list', '--count', `--since=${isoDate}`, 'HEAD']);
  return out === null ? null : parseInt(out, 10);
}

// ---------- read map ----------

function docMeta(key) {
  const tpl = readTemplate(path.join('lore', MANIFEST[key].file));
  const fm = parseFrontmatter(tpl);
  return {
    key,
    file: MANIFEST[key].file,
    tier: MANIFEST[key].tier,
    title: fm.title || key,
    summary: fm.summary || '',
    readWhen: fm['read-when'] || '',
    updateWhen: fm['update-when'] || '',
  };
}

function tableRow(link, title, readWhen, updateWhen) {
  return `| [\`${link}\`](${link}) — ${title} | ${readWhen} | ${updateWhen} |`;
}

function rowFor(key) {
  const m = docMeta(key);
  return tableRow(`lore/${m.file}`, m.title, m.readWhen, m.updateWhen);
}

function buildManifestTable(keys) {
  return [
    '| Doc | Read it when | Update it when |',
    '| --- | --- | --- |',
    ...keys.map(rowFor),
  ].join('\n');
}

// Files referenced in the "## Read map" section of AGENTS.md, or null if the
// section is gone (user rewrote the file — then we don't police it).
function readMapFiles(agentsContent) {
  const parts = agentsContent.split(/^## /m);
  const section = parts.find((s) => s.toLowerCase().startsWith('read map'));
  if (!section) return null;
  return [...section.matchAll(/lore\/([\w./-]+\.md)/g)].map((m) => m[1]);
}

// entries: [{needle, row}] — a row is added unless needle already appears.
function insertReadMapRowsGeneric(agentsPath, entries) {
  if (!fs.existsSync(agentsPath)) return false;
  const content = fs.readFileSync(agentsPath, 'utf8');
  const missing = entries.filter((e) => !content.includes(e.needle));
  if (!missing.length) return true;

  const lines = content.split('\n');
  const start = lines.findIndex((l) => /^## read map/i.test(l.trim()));
  if (start === -1) return false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }
  let lastRow = -1;
  for (let i = start + 1; i < end; i++) {
    if (lines[i].trim().startsWith('|')) lastRow = i;
  }
  if (lastRow === -1) return false;

  lines.splice(lastRow + 1, 0, ...missing.map((e) => e.row));
  fs.writeFileSync(agentsPath, lines.join('\n'));
  return true;
}

function insertReadMapRows(agentsPath, keys) {
  return insertReadMapRowsGeneric(
    agentsPath,
    keys.map((k) => ({ needle: `lore/${MANIFEST[k].file}`, row: rowFor(k) }))
  );
}

// ---------- tasks ----------

function tasksDir(cwd) {
  return path.join(cwd, LORE_DIR, 'tasks');
}

function loadTasks(cwd) {
  const dir = tasksDir(cwd);
  if (!fs.existsSync(dir)) return null;
  const tasks = [];
  const scan = (d, location) => {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.md')) continue;
      const file = path.join(d, f);
      const content = fs.readFileSync(file, 'utf8');
      const fm = parseFrontmatter(content);
      tasks.push({ file, location, fm, content });
    }
  };
  scan(dir, 'active');
  scan(path.join(dir, 'done'), 'done');
  return tasks;
}

function taskDeps(t) {
  return (t.fm['depends-on'] || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Effective status: an open task with unmet dependencies is blocked.
function taskStatus(t, all) {
  const s = (t.fm.status || 'open').toLowerCase();
  if (s !== 'open') return s;
  const unmet = taskDeps(t).filter((d) => {
    const dep = all.find((x) => x.fm.id === d);
    return !dep || (dep.fm.status || '').toLowerCase() !== 'done';
  });
  return unmet.length ? 'blocked' : 'open';
}

function nextTaskId(tasks) {
  let max = 0;
  for (const t of tasks) {
    const m = /^T-(\d+)/.exec(t.fm.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `T-${String(max + 1).padStart(4, '0')}`;
}

function taskSummaryLine(t, all) {
  const s = taskStatus(t, all);
  const who = t.fm['claimed-by'] ? ` ${c.dim('by ' + t.fm['claimed-by'])}` : '';
  const zone = t.fm.zone ? `[${t.fm.zone}]` : '';
  const color = { open: c.green, claimed: c.yellow, blocked: c.red, done: c.dim }[s] || ((x) => x);
  return `  ${t.fm.id}  ${color(s.padEnd(7))}${who ? '' : ''} ${(t.fm.priority || 'normal').padEnd(6)} ${zone.padEnd(12)} ${t.fm.title || ''}${who}`;
}

function requireTasksDir(cwd) {
  if (!fs.existsSync(tasksDir(cwd))) {
    console.error('no lore/tasks/ directory — run "lore fleet init" first');
    process.exit(1);
  }
}

function cmdTask(args) {
  const cwd = process.cwd();
  const sub = args[0];
  const rest = args.slice(1);
  const json = args.includes('--json');

  switch (sub) {
    case 'add': {
      requireTasksDir(cwd);
      const title = positionals(rest).join(' ');
      if (!title) {
        console.error('usage: lore task add <title...> [--zone Z] [--priority high|normal|low] [--depends T-0001,T-0002] [--desc "..."]');
        process.exit(1);
      }
      const priority = flagValue(rest, '--priority') || 'normal';
      if (!PRIORITIES.includes(priority)) {
        console.error(`invalid priority "${priority}" — use: ${PRIORITIES.join(', ')}`);
        process.exit(1);
      }
      const zone = flagValue(rest, '--zone') || 'general';
      const depends = flagValue(rest, '--depends') || '';
      const desc = flagValue(rest, '--desc') || title;
      const tasks = loadTasks(cwd);
      const id = nextTaskId(tasks);
      const file = path.join(tasksDir(cwd), `${id}-${slugify(title)}.md`);
      const content = `---
id: ${id}
title: ${title}
status: open
priority: ${priority}
zone: ${zone}
depends-on: ${depends}
created: ${today()}
claimed-by:
claimed-at:
---

# ${id} — ${title}

## What
${desc}

## Acceptance criteria
- [ ] the changed behavior was exercised end-to-end and works
`;
      fs.writeFileSync(file, content);
      console.log(`  ${c.green('created')}  ${path.relative(cwd, file)} ${c.dim(`(${priority}, zone: ${zone})`)}`);
      break;
    }

    case 'list': {
      requireTasksDir(cwd);
      const tasks = loadTasks(cwd);
      const statusFilter = flagValue(rest, '--status');
      const zoneFilter = flagValue(rest, '--zone');
      let shown = tasks.filter((t) => {
        const s = taskStatus(t, tasks);
        if (statusFilter && statusFilter !== 'all' && s !== statusFilter) return false;
        if (!statusFilter && t.location === 'done') return false;
        if (zoneFilter && (t.fm.zone || 'general') !== zoneFilter) return false;
        return true;
      });
      shown.sort((a, b) => (a.fm.id || '').localeCompare(b.fm.id || ''));
      if (json) {
        console.log(JSON.stringify(shown.map((t) => ({
          id: t.fm.id, title: t.fm.title, status: taskStatus(t, tasks),
          priority: t.fm.priority || 'normal', zone: t.fm.zone || 'general',
          dependsOn: taskDeps(t), claimedBy: t.fm['claimed-by'] || null,
          file: path.relative(cwd, t.file),
        })), null, 2));
        break;
      }
      if (!shown.length) {
        console.log('no matching tasks');
      } else {
        for (const t of shown) console.log(taskSummaryLine(t, tasks));
      }
      const doneCount = tasks.filter((t) => t.location === 'done').length;
      if (!statusFilter) console.log(c.dim(`\n  ${doneCount} done in lore/tasks/done/ — "lore task list --status all" to include`));
      break;
    }

    case 'next': {
      requireTasksDir(cwd);
      const tasks = loadTasks(cwd);
      const zoneFilter = flagValue(rest, '--zone');
      const claim = rest.includes('--claim');
      const by = flagValue(rest, '--by') || process.env.LORE_AGENT || null;

      const busyZones = new Set(
        tasks.filter((t) => taskStatus(t, tasks) === 'claimed').map((t) => t.fm.zone || 'general')
      );
      const eligible = tasks
        .filter((t) => t.location === 'active' && taskStatus(t, tasks) === 'open')
        .filter((t) => !zoneFilter || (t.fm.zone || 'general') === zoneFilter)
        .sort((a, b) => {
          // Soft zone rule: prefer zones with no active claim (fewer merge conflicts).
          const zoneBusy = (t) => (busyZones.has(t.fm.zone || 'general') ? 1 : 0);
          if (zoneBusy(a) !== zoneBusy(b)) return zoneBusy(a) - zoneBusy(b);
          const p = (t) => PRIORITIES.indexOf(t.fm.priority || 'normal');
          if (p(a) !== p(b)) return p(a) - p(b);
          return (a.fm.id || '').localeCompare(b.fm.id || '');
        });

      if (!eligible.length) {
        if (json) console.log('null');
        else console.log('no eligible open tasks (unclaimed, dependencies met)');
        process.exit(1);
      }
      const t = eligible[0];

      if (claim) {
        if (!by) {
          console.error('claiming needs an agent id: pass --by <id> or set LORE_AGENT');
          process.exit(1);
        }
        const updated = setFrontmatter(t.content, {
          status: 'claimed',
          'claimed-by': by,
          'claimed-at': new Date().toISOString(),
        });
        fs.writeFileSync(t.file, updated);
      }

      if (json) {
        console.log(JSON.stringify({
          id: t.fm.id, title: t.fm.title, priority: t.fm.priority || 'normal',
          zone: t.fm.zone || 'general', file: path.relative(cwd, t.file),
          claimed: claim, claimedBy: claim ? by : null,
        }, null, 2));
      } else {
        console.log(`  ${c.bold(t.fm.id)}  ${t.fm.title} ${c.dim(`(${t.fm.priority || 'normal'}, zone: ${t.fm.zone || 'general'})`)}`);
        console.log(`  ${c.dim('file:')} ${path.relative(cwd, t.file)}`);
        if (claim) {
          console.log(`  ${c.green('claimed')} by ${by} — commit this claim NOW, alone, and push:`);
          console.log(`  ${c.dim(`git commit -am "fleet: claim ${t.fm.id} (${by})" && git push`)}`);
        }
      }
      break;
    }

    case 'claim': {
      requireTasksDir(cwd);
      const id = positionals(rest)[0];
      const by = flagValue(rest, '--by') || process.env.LORE_AGENT || null;
      if (!id || !by) {
        console.error('usage: lore task claim <id> --by <agent-id>');
        process.exit(1);
      }
      const tasks = loadTasks(cwd);
      const t = tasks.find((x) => x.fm.id === id);
      if (!t) { console.error(`no task ${id}`); process.exit(1); }
      const s = taskStatus(t, tasks);
      if (s !== 'open') {
        console.error(`${id} is ${s}${t.fm['claimed-by'] ? ` (by ${t.fm['claimed-by']})` : ''} — only open tasks can be claimed`);
        process.exit(1);
      }
      fs.writeFileSync(t.file, setFrontmatter(t.content, {
        status: 'claimed',
        'claimed-by': by,
        'claimed-at': new Date().toISOString(),
      }));
      console.log(`  ${c.green('claimed')}  ${id} by ${by} — commit the claim alone and push before starting work`);
      break;
    }

    case 'done': {
      requireTasksDir(cwd);
      const id = positionals(rest)[0];
      if (!id) { console.error('usage: lore task done <id>'); process.exit(1); }
      const tasks = loadTasks(cwd);
      const t = tasks.find((x) => x.fm.id === id);
      if (!t) { console.error(`no task ${id}`); process.exit(1); }
      if (t.location === 'done') { console.log(`${id} is already done`); break; }
      const updated = setFrontmatter(t.content, { status: 'done', done: today() });
      const doneDir = path.join(tasksDir(cwd), 'done');
      fs.mkdirSync(doneDir, { recursive: true });
      const target = path.join(doneDir, path.basename(t.file));
      fs.writeFileSync(target, updated);
      fs.rmSync(t.file);
      console.log(`  ${c.green('done')}  ${id} → lore/tasks/done/`);
      console.log(c.dim('  now write your session file: lore/sessions/<date>-<agent>.md'));
      break;
    }

    case 'reopen': {
      requireTasksDir(cwd);
      const id = positionals(rest)[0];
      if (!id) { console.error('usage: lore task reopen <id>'); process.exit(1); }
      const tasks = loadTasks(cwd);
      const t = tasks.find((x) => x.fm.id === id);
      if (!t) { console.error(`no task ${id}`); process.exit(1); }
      const updated = setFrontmatter(t.content, {
        status: 'open', 'claimed-by': '', 'claimed-at': '',
      });
      const target = path.join(tasksDir(cwd), path.basename(t.file));
      fs.writeFileSync(target, updated);
      if (t.file !== target) fs.rmSync(t.file);
      console.log(`  ${c.green('reopened')}  ${id}`);
      break;
    }

    case 'show': {
      requireTasksDir(cwd);
      const id = positionals(rest)[0];
      const tasks = loadTasks(cwd);
      const t = tasks.find((x) => x.fm.id === id);
      if (!t) { console.error(`no task ${id}`); process.exit(1); }
      console.log(t.content);
      break;
    }

    default:
      console.error('usage: lore task add|list|next|claim|done|reopen|show');
      process.exit(1);
  }
}

// ---------- fleet ----------

function cmdFleet(args) {
  const cwd = process.cwd();
  if (args[0] !== 'init') {
    console.error('usage: lore fleet init   (convert this repo for multi-agent work)');
    process.exit(1);
  }
  const agentsPath = path.join(cwd, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    console.error('no AGENTS.md — run "lore init" first');
    process.exit(1);
  }

  const created = [];
  const mkdir = (rel) => {
    const p = path.join(cwd, rel);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      fs.writeFileSync(path.join(p, '.gitkeep'), '');
      created.push(rel + '/');
    }
  };
  mkdir(path.join(LORE_DIR, 'tasks'));
  mkdir(path.join(LORE_DIR, 'tasks', 'done'));
  mkdir(path.join(LORE_DIR, 'sessions'));

  // Protocol doc + its read-map row.
  const fleetPath = path.join(cwd, LORE_DIR, 'fleet.md');
  if (!fs.existsSync(fleetPath)) {
    fs.writeFileSync(fleetPath, render(readTemplate(path.join('lore', 'fleet.md')), { DATE: today() }));
    created.push('lore/fleet.md');
  }
  const fleetFm = parseFrontmatter(readTemplate(path.join('lore', 'fleet.md')));
  insertReadMapRowsGeneric(agentsPath, [{
    needle: 'lore/fleet.md',
    row: tableRow('lore/fleet.md', fleetFm.title || 'Fleet protocol', fleetFm['read-when'] || '', fleetFm['update-when'] || ''),
  }]);

  // Migrate todo.md checkboxes into task files.
  const todoPath = path.join(cwd, LORE_DIR, 'todo.md');
  const migrated = [];
  let alreadyDone = [];
  if (fs.existsSync(todoPath)) {
    const todoContent = fs.readFileSync(todoPath, 'utf8');
    const priorityFor = { now: 'high', next: 'normal', later: 'low' };
    let priority = 'normal';
    for (const line of todoContent.split('\n')) {
      const h = /^##\s+(\w+)/.exec(line);
      if (h) priority = priorityFor[h[1].toLowerCase()] || 'normal';
      const open = /^\s*- \[ \]\s*(.+)$/.exec(line);
      const done = /^\s*- \[x\]\s*(.+)$/i.exec(line);
      if (open && open[1].trim() && !open[1].includes(FILL_MARKER)) {
        const title = open[1].trim();
        const tasks = loadTasks(cwd);
        const id = nextTaskId(tasks);
        fs.writeFileSync(
          path.join(tasksDir(cwd), `${id}-${slugify(title)}.md`),
          `---\nid: ${id}\ntitle: ${title}\nstatus: open\npriority: ${priority}\nzone: general\ndepends-on: \ncreated: ${today()}\nclaimed-by: \nclaimed-at: \n---\n\n# ${id} — ${title}\n\n## What\n${title} (migrated from todo.md)\n\n## Acceptance criteria\n- [ ] the changed behavior was exercised end-to-end and works\n`
        );
        migrated.push(`${id} ${title}`);
      }
      if (done && done[1].trim()) alreadyDone.push(done[1].trim());
    }
    if (alreadyDone.length) {
      const donePath = path.join(cwd, LORE_DIR, 'done.md');
      let doneContent = fs.existsSync(donePath) ? fs.readFileSync(donePath, 'utf8') : '# Done\n';
      if (!doneContent.endsWith('\n')) doneContent += '\n';
      doneContent += `\n## ${today()}\n${alreadyDone.map((m) => `- ${m}`).join('\n')}\n`;
      fs.writeFileSync(donePath, doneContent);
    }
    // Replace todo.md's body with a pointer so there is exactly one task system.
    const fmBlock = todoContent.match(/^---\n[\s\S]*?\n---/);
    const pointer = `${fmBlock ? fmBlock[0] : ''}

# To-do

**This repo runs in fleet mode — tasks live in \`lore/tasks/\`, one file
per task.** Do not add checkboxes here.

- Claim your next task: \`lore task next --claim --by <agent-id>\`
- See all tasks: \`lore task list\`
- The protocol: [lore/fleet.md](fleet.md) — read it before working
`;
    fs.writeFileSync(todoPath, pointer);
  }

  console.log(c.bold(`\nfleet mode initialized\n`));
  for (const f of created) console.log(`  ${c.green('created')}  ${f}`);
  if (migrated.length) {
    console.log(`\n  migrated ${migrated.length} todo item${migrated.length > 1 ? 's' : ''} to task files:`);
    for (const m of migrated) console.log(`    ${c.dim(m)}`);
  }
  if (alreadyDone.length) console.log(`  moved ${alreadyDone.length} completed item${alreadyDone.length > 1 ? 's' : ''} to done.md`);
  console.log(`
${c.bold('Fleet quickstart')}
  agent id:   export LORE_AGENT=agent-01   (unique per agent/worktree)
  add work:   lore task add "Fix login redirect" --zone auth --priority high
  claim:      lore task next --claim        ${c.dim('(commit the claim alone, push — first push wins)')}
  finish:     lore task done T-0001
  protocol:   lore/fleet.md — every agent reads it first
`);
}

// ---------- playbooks ----------

function playbooksDir(cwd) {
  return path.join(cwd, LORE_DIR, 'playbooks');
}

function cmdPlaybook(args) {
  const cwd = process.cwd();
  const sub = args[0];
  const rest = args.slice(1);

  switch (sub) {
    case 'add': {
      const title = positionals(rest).join(' ');
      if (!title) {
        console.error('usage: lore playbook add <name of the operation...>');
        process.exit(1);
      }
      if (!fs.existsSync(path.join(cwd, 'AGENTS.md'))) {
        console.error('no AGENTS.md — run "lore init" first');
        process.exit(1);
      }
      fs.mkdirSync(playbooksDir(cwd), { recursive: true });
      const file = path.join(playbooksDir(cwd), `${slugify(title)}.md`);
      if (fs.existsSync(file)) {
        console.error(`already exists: ${path.relative(cwd, file)}`);
        process.exit(1);
      }
      fs.writeFileSync(file, render(readTemplate('playbook.md'), {
        TITLE: title,
        TITLE_LOWER: title.toLowerCase(),
        DATE: today(),
      }));
      insertReadMapRowsGeneric(path.join(cwd, 'AGENTS.md'), [{
        needle: 'lore/playbooks/',
        row: tableRow('lore/playbooks/', 'Playbooks', 'before starting a common multi-step operation — follow the matching recipe exactly', 'a recipe changes, or you complete an operation worth repeating'),
      }]);
      console.log(`  ${c.green('created')}  ${path.relative(cwd, file)}`);
      console.log(c.dim('  fill in the steps while the operation is fresh — golden example, exact paths, verify command'));
      break;
    }

    case 'list': {
      const files = walkMd(playbooksDir(cwd));
      if (!files.length) {
        console.log('no playbooks yet — capture one with: lore playbook add <operation>');
        break;
      }
      for (const f of files) {
        const fm = parseFrontmatter(fs.readFileSync(f, 'utf8'));
        console.log(`  ${path.basename(f, '.md').padEnd(28)} ${c.dim(fm.summary || fm.title || '')}`);
      }
      break;
    }

    default:
      console.error('usage: lore playbook add|list');
      process.exit(1);
  }
}

// ---------- digest ----------

function cmdDigest() {
  const cwd = process.cwd();
  const agentsPath = path.join(cwd, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    console.error('no AGENTS.md — run "lore init" first');
    process.exit(1);
  }
  const agents = fs.readFileSync(agentsPath, 'utf8');
  const nameMatch = agents.match(/^# (.+?) — /m);
  const name = nameMatch ? nameMatch[1] : path.basename(cwd);

  const lines = [];
  lines.push(`# ${name} — lore digest (${today()})`);
  lines.push('');
  lines.push('The one-page brief. Full rules live in AGENTS.md; docs live in lore/.');
  lines.push('');
  lines.push('## Rules, short form');
  lines.push('1. Work only on tracked tasks (`lore/tasks/` in fleet mode, else `lore/todo.md`).');
  lines.push('2. Done means VERIFIED: built, tested, exercised end-to-end once.');
  lines.push('3. Decisions are settled — check `decisions.md` before proposing; append, never rewrite.');
  lines.push(`4. \`${FILL_MARKER}\` means ask the human. Never guess it.`);
  lines.push('5. A change that makes a doc wrong fixes that doc in the same commit.');
  lines.push('6. Anything only the human can do goes to `user-actions.md`.');
  lines.push('');
  lines.push('## Docs');

  const groups = { '': [], guides: [], playbooks: [] };
  for (const f of listDocFiles(cwd)) {
    const rel = loreRel(cwd, f);
    const top = rel.includes('/') ? rel.split('/')[0] : '';
    const fm = parseFrontmatter(fs.readFileSync(f, 'utf8'));
    (groups[top] || (groups[top] = [])).push(`- \`lore/${rel}\` — ${fm.summary || fm.title || rel}`);
  }
  lines.push(...groups[''].sort());
  for (const group of Object.keys(groups)) {
    if (group && groups[group].length) {
      lines.push('', `### ${group}`, ...groups[group].sort());
    }
  }

  const tasks = loadTasks(cwd);
  if (tasks) {
    const counts = { open: 0, claimed: 0, blocked: 0, done: 0 };
    for (const t of tasks) counts[taskStatus(t, tasks)] = (counts[taskStatus(t, tasks)] || 0) + 1;
    lines.push('', '## Fleet');
    lines.push(`- ${counts.open || 0} open, ${counts.claimed || 0} claimed, ${counts.blocked || 0} blocked, ${counts.done || 0} done`);
    lines.push('- Claim work with: `lore task next --claim --by <agent-id>` (protocol: lore/fleet.md)');
  }

  const uaPath = path.join(cwd, LORE_DIR, 'user-actions.md');
  if (fs.existsSync(uaPath)) {
    const openItems = (fs.readFileSync(uaPath, 'utf8').match(/^\s*- \[ \]/gm) || []).length;
    if (openItems) lines.push('', `## Human blockers`, `- ${openItems} open item${openItems > 1 ? 's' : ''} in lore/user-actions.md`);
  }

  console.log(lines.join('\n'));
}

// ---------- init / add ----------

function writeDoc(targetPath, content, force, results) {
  const rel = path.relative(process.cwd(), targetPath);
  if (fs.existsSync(targetPath) && !force) {
    results.skipped.push(rel);
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
  results.created.push(rel);
}

function cmdInit(args) {
  const cwd = process.cwd();
  const force = args.includes('--force');
  const full = args.includes('--full');
  const projectName = flagValue(args, '--name') || path.basename(cwd);

  const stack = detectStack(cwd);
  const keys = Object.keys(MANIFEST).filter(
    (k) => full || MANIFEST[k].tier === 'core'
  );

  // Auto-include deployment docs when container config is present.
  if (!full && stack.some((s) => s.startsWith('Docker')) && !keys.includes('deployment')) {
    keys.push('deployment');
  }

  const vars = {
    PROJECT_NAME: projectName,
    DATE: today(),
    STACK: stack.length ? stack.join(', ') : FILL_MARKER + ' (describe the stack)',
    TOOL_VERSION: PKG.version,
    MANIFEST_TABLE: buildManifestTable(keys),
  };

  const results = { created: [], skipped: [] };

  writeDoc(
    path.join(cwd, 'AGENTS.md'),
    render(readTemplate('AGENTS.md'), vars),
    force,
    results
  );

  // CLAUDE.md: never overwrite an existing one, even with --force.
  const claudePath = path.join(cwd, 'CLAUDE.md');
  let claudeNote = null;
  if (fs.existsSync(claudePath)) {
    claudeNote =
      'CLAUDE.md already exists — add this line near the top yourself:\n' +
      '  "Read AGENTS.md first — it is the agent operating manual for this repo."';
  } else {
    writeDoc(claudePath, render(readTemplate('CLAUDE.md'), vars), false, results);
  }

  for (const key of keys) {
    writeDoc(
      installedDocPath(cwd, key),
      render(readTemplate(path.join('lore', MANIFEST[key].file)), vars),
      force,
      results
    );
  }

  console.log(c.bold(`\nlore ${PKG.version} — ${projectName}\n`));
  if (stack.length) console.log(`  detected stack: ${stack.join(', ')}`);
  console.log(`  tier: ${full ? 'full' : 'core'} (${keys.length} docs)\n`);
  for (const f of results.created) console.log(`  ${c.green('created')}  ${f}`);
  for (const f of results.skipped) console.log(`  ${c.yellow('skipped')}  ${f} ${c.dim('(exists — use --force to overwrite)')}`);
  if (claudeNote) console.log(`\n  ${c.yellow('note')}  ${claudeNote}`);

  console.log(`
${c.bold('Next steps')}
  1. Open AGENTS.md — it is the router and rulebook for every agent session.
  2. Fill the ${FILL_MARKER} placeholders, or tell your agent:
     ${c.dim('"Read AGENTS.md, then interview me to fill in the lore docs."')}
  3. Run ${c.bold('lore doctor')} any time to catch stale or unfinished docs.
  ${c.dim('More: "lore fleet init" for multi-agent work · "lore ci" gates PRs · "lore link" covers other AI tools · "lore digest" prints the one-page brief.')}
`);
}

function cmdAdd(args) {
  const cwd = process.cwd();
  const force = args.includes('--force');
  const targets = positionals(args);
  if (!targets.length) {
    console.error('usage: lore add <doc...> | all   (see: lore list)');
    process.exit(1);
  }
  const keys = targets[0] === 'all' ? Object.keys(MANIFEST) : targets;

  const unknown = keys.filter((k) => !MANIFEST[k]);
  if (unknown.length) {
    console.error(`unknown doc(s): ${unknown.join(', ')}\nrun "lore list" to see available docs`);
    process.exit(1);
  }

  const vars = {
    PROJECT_NAME: path.basename(cwd),
    DATE: today(),
    STACK: FILL_MARKER,
    TOOL_VERSION: PKG.version,
    MANIFEST_TABLE: '',
  };
  const results = { created: [], skipped: [] };
  for (const key of keys) {
    writeDoc(
      installedDocPath(cwd, key),
      render(readTemplate(path.join('lore', MANIFEST[key].file)), vars),
      force,
      results
    );
  }
  for (const f of results.created) console.log(`  ${c.green('created')}  ${f}`);
  for (const f of results.skipped) console.log(`  ${c.yellow('skipped')}  ${f} ${c.dim('(exists)')}`);

  if (results.created.length) {
    const agentsPath = path.join(cwd, 'AGENTS.md');
    if (fs.existsSync(agentsPath) && insertReadMapRows(agentsPath, keys)) {
      console.log(`  ${c.green('updated')}  AGENTS.md read map`);
    } else {
      console.log(`\n  ${c.yellow('note')}  couldn't update the AGENTS.md read map — add a row for each new doc.`);
    }
  }
}

// ---------- doctor ----------

function cmdDoctor(args) {
  const cwd = process.cwd();
  const json = args.includes('--json');
  const maxAge = parseInt(flagValue(args, '--max-age') || DEFAULT_MAX_AGE_DAYS, 10);
  const claimAgeHours = parseInt(flagValue(args, '--claim-age') || DEFAULT_CLAIM_AGE_HOURS, 10);

  const issues = [];
  const add = (file, type, message) => issues.push({ file, type, message });
  const stats = { scanned: 0, stale: 0, placeholders: 0, unsyncedTasks: 0 };

  const agentsPath = path.join(cwd, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    add('AGENTS.md', 'missing', 'missing — run "lore init"');
    return finishDoctor(json, maxAge, issues, stats);
  }

  const files = [agentsPath, ...listDocFiles(cwd)];
  const lastCommit = gitLastCommitDate(cwd);
  const now = Date.now();

  for (const file of files) {
    stats.scanned++;
    const rel = path.relative(cwd, file);
    const content = fs.readFileSync(file, 'utf8');
    const fm = parseFrontmatter(content);

    if (!fm['last-verified']) {
      add(rel, 'no-verified-date', 'no "last-verified" date in frontmatter');
    } else {
      const verified = Date.parse(fm['last-verified']);
      if (Number.isNaN(verified)) {
        add(rel, 'bad-date', `unparseable last-verified date: "${fm['last-verified']}"`);
      } else {
        const ageDays = Math.floor((now - verified) / 86400000);
        if (ageDays > maxAge) {
          // Git-aware: an old date in a repo with no commits since is not
          // stale — nothing changed, so the doc can't have drifted.
          const quiet = lastCommit !== null && Date.parse(lastCommit) <= verified;
          if (!quiet) {
            const commits = gitCommitsSince(cwd, fm['last-verified']);
            const suffix =
              commits !== null ? `, ${commits} commit${commits === 1 ? '' : 's'} since` : '';
            add(rel, 'stale', `stale — last verified ${ageDays} days ago${suffix} — re-check it and run "lore touch"`);
            stats.stale++;
          }
        }
      }
    }

    // Bare markers only — `_FILL_ME_` in backticks is documentation, not a placeholder.
    const fills = (content.match(new RegExp(`(?<!\`)${FILL_MARKER}(?!\`)`, 'g')) || []).length;
    if (fills > 0) {
      stats.placeholders += fills;
      add(rel, 'placeholders', `${fills} ${FILL_MARKER} placeholder${fills > 1 ? 's' : ''} remaining`);
    }
  }

  // Read-map drift: every doc on disk should be routable, every route real.
  const mapped = readMapFiles(fs.readFileSync(agentsPath, 'utf8'));
  if (mapped !== null) {
    const onDisk = listDocFiles(cwd).map((f) => loreRel(cwd, f));
    for (const f of onDisk) {
      // Playbooks are routed via their directory row, not per-file rows.
      if (f.startsWith('playbooks/')) continue;
      if (!mapped.includes(f)) {
        add(`lore/${f}`, 'orphan', "not in the AGENTS.md read map — agents won't find it");
      }
    }
    for (const f of mapped) {
      if (COLLECTION_DIRS.includes(f.split('/')[0])) continue;
      if (!onDisk.includes(f)) {
        add('AGENTS.md', 'dead-link', `read map references lore/${f} but the file is missing`);
      }
    }
  }

  const todoPath = path.join(cwd, LORE_DIR, 'todo.md');
  if (fs.existsSync(todoPath)) {
    const done = (fs.readFileSync(todoPath, 'utf8').match(/^\s*- \[x\]/gim) || []).length;
    if (done > 0) {
      stats.unsyncedTasks = done;
      add('lore/todo.md', 'unsynced', `${done} completed task${done > 1 ? 's' : ''} not yet moved to done.md — run "lore sync"`);
    }
  }

  // Fleet checks.
  const tasks = loadTasks(cwd);
  if (tasks) {
    stats.tasks = { open: 0, claimed: 0, blocked: 0, done: 0 };
    const seenIds = new Map();
    const knownIds = new Set(tasks.map((t) => t.fm.id).filter(Boolean));

    for (const t of tasks) {
      const rel = path.relative(cwd, t.file);
      const s = taskStatus(t, tasks);
      stats.tasks[s] = (stats.tasks[s] || 0) + 1;

      if (!t.fm.id) {
        add(rel, 'task-malformed', 'task file has no id in frontmatter');
        continue;
      }
      if (seenIds.has(t.fm.id)) {
        add(rel, 'task-duplicate-id', `duplicate task id ${t.fm.id} (also in ${seenIds.get(t.fm.id)}) — renumber one`);
      }
      seenIds.set(t.fm.id, rel);

      for (const d of taskDeps(t)) {
        if (!knownIds.has(d)) {
          add(rel, 'task-unknown-dep', `depends on ${d}, which does not exist`);
        }
      }

      if (t.location === 'done' && (t.fm.status || '').toLowerCase() !== 'done') {
        add(rel, 'task-status-mismatch', `in tasks/done/ but status is "${t.fm.status}"`);
      }
      if (t.location === 'active' && (t.fm.status || '').toLowerCase() === 'done') {
        add(rel, 'task-unsynced', 'status is done but still in tasks/ — run "lore sync"');
      }

      if (s === 'claimed' && t.fm['claimed-at']) {
        const claimedAt = Date.parse(t.fm['claimed-at']);
        if (!Number.isNaN(claimedAt)) {
          const hours = Math.floor((now - claimedAt) / 3600000);
          if (hours > claimAgeHours) {
            add(rel, 'task-stale-claim', `claimed by ${t.fm['claimed-by'] || '?'} ${hours}h ago — presumed dead; orchestrator should "lore task reopen ${t.fm.id}"`);
          }
        }
      }
    }

    // Zone pileups: parallel claims in one zone are where conflicts come from.
    const claimsByZone = {};
    for (const t of tasks.filter((t) => taskStatus(t, tasks) === 'claimed')) {
      const z = t.fm.zone || 'general';
      (claimsByZone[z] = claimsByZone[z] || []).push(t.fm.id);
    }
    for (const [zone, ids] of Object.entries(claimsByZone)) {
      if (ids.length > 1) {
        add('lore/tasks/', 'task-zone-pileup', `${ids.length} active claims in zone "${zone}" (${ids.join(', ')}) — expect merge conflicts`);
      }
    }

    // Cycle detection over depends-on.
    const cycle = findDependencyCycle(tasks);
    if (cycle) {
      add('lore/tasks/', 'task-dependency-cycle', `dependency cycle: ${cycle.join(' → ')} — none of these can ever start`);
    }
  }

  finishDoctor(json, maxAge, issues, stats);
}

function findDependencyCycle(tasks) {
  const deps = new Map(tasks.filter((t) => t.fm.id).map((t) => [t.fm.id, taskDeps(t)]));
  const visiting = new Set();
  const done = new Set();
  let cycle = null;
  const dfs = (id, stack) => {
    if (cycle || done.has(id)) return;
    if (visiting.has(id)) {
      cycle = [...stack.slice(stack.indexOf(id)), id];
      return;
    }
    visiting.add(id);
    stack.push(id);
    for (const d of deps.get(id) || []) dfs(d, stack);
    stack.pop();
    visiting.delete(id);
    done.add(id);
  };
  for (const id of deps.keys()) dfs(id, []);
  return cycle;
}

function finishDoctor(json, maxAge, issues, stats) {
  if (json) {
    console.log(JSON.stringify({ ok: issues.length === 0, maxAgeDays: maxAge, stats, issues }, null, 2));
    if (issues.length) process.exit(1);
    return;
  }

  console.log(c.bold(`\nlore doctor ${c.dim(`(max staleness: ${maxAge} days)`)}\n`));
  for (const issue of issues) {
    const icon = issue.type === 'missing' ? c.red('✗') : c.yellow('!');
    console.log(`  ${icon} ${issue.file}  ${issue.message}`);
  }
  const taskNote = stats.tasks
    ? ` · tasks: ${stats.tasks.open} open, ${stats.tasks.claimed} claimed, ${stats.tasks.blocked} blocked, ${stats.tasks.done} done`
    : '';
  if (!issues.length) {
    console.log(`  ${c.green('✓')} all lore docs present, fresh, and filled in ${c.dim(`(${stats.scanned} scanned${taskNote})`)}\n`);
  } else {
    console.log(`\n  ${issues.length} issue${issues.length > 1 ? 's' : ''} found ${c.dim(`(${stats.scanned} docs scanned${taskNote})`)}\n`);
    process.exit(1);
  }
}

// ---------- sync ----------

function cmdSync() {
  const cwd = process.cwd();
  const todoPath = path.join(cwd, LORE_DIR, 'todo.md');
  const donePath = path.join(cwd, LORE_DIR, 'done.md');
  const hasTasks = fs.existsSync(tasksDir(cwd));
  let didSomething = false;

  if (!fs.existsSync(todoPath) && !hasTasks) {
    console.error('nothing to sync — no lore/todo.md and no lore/tasks/ (run "lore init" first)');
    process.exit(1);
  }

  // Classic mode: move [x] checkboxes from todo.md to done.md.
  if (fs.existsSync(todoPath)) {
    const lines = fs.readFileSync(todoPath, 'utf8').split('\n');
    const kept = [];
    const moved = [];
    for (const line of lines) {
      if (/^\s*- \[x\]/i.test(line)) {
        moved.push(line.replace(/^\s*- \[x\]\s*/i, '').trim());
      } else {
        kept.push(line);
      }
    }
    if (moved.length) {
      let done = fs.existsSync(donePath) ? fs.readFileSync(donePath, 'utf8') : '# Done\n';
      const heading = `## ${today()}`;
      if (done.includes(heading)) {
        const idx = done.indexOf(heading) + heading.length;
        done = done.slice(0, idx) + '\n' + moved.map((m) => `- ${m}`).join('\n') + done.slice(idx);
      } else {
        if (!done.endsWith('\n')) done += '\n';
        done += `\n${heading}\n${moved.map((m) => `- ${m}`).join('\n')}\n`;
      }
      fs.writeFileSync(donePath, done);
      fs.writeFileSync(todoPath, kept.join('\n'));
      console.log(`moved ${moved.length} task${moved.length > 1 ? 's' : ''} to lore/done.md:`);
      for (const m of moved) console.log(`  ${c.green('✓')} ${m}`);
      didSomething = true;
    }
  }

  // Fleet mode: move task files with status done into tasks/done/.
  if (hasTasks) {
    const tasks = loadTasks(cwd) || [];
    const finished = tasks.filter(
      (t) => t.location === 'active' && (t.fm.status || '').toLowerCase() === 'done'
    );
    if (finished.length) {
      const doneDir = path.join(tasksDir(cwd), 'done');
      fs.mkdirSync(doneDir, { recursive: true });
      for (const t of finished) {
        fs.writeFileSync(path.join(doneDir, path.basename(t.file)), t.content);
        fs.rmSync(t.file);
        console.log(`  ${c.green('✓')} ${t.fm.id || path.basename(t.file)} → lore/tasks/done/`);
      }
      didSomething = true;
    }
  }

  if (!didSomething) console.log('nothing to sync — no completed tasks');
}

// ---------- touch ----------

function cmdTouch(args) {
  const cwd = process.cwd();
  const targets = positionals(args);
  if (!targets.length) {
    console.error('usage: lore touch <doc...> | all | agents\nonly touch docs you have actually re-checked against the code');
    process.exit(1);
  }

  let files = [];
  if (targets[0] === 'all') {
    files = [path.join(cwd, 'AGENTS.md'), ...listDocFiles(cwd)].filter((f) => fs.existsSync(f));
  } else {
    for (const t of targets) {
      if (t === 'agents') {
        files.push(path.join(cwd, 'AGENTS.md'));
      } else if (MANIFEST[t]) {
        files.push(installedDocPath(cwd, t));
      } else {
        console.error(`unknown doc: ${t}   (see: lore list, or "agents" for AGENTS.md)`);
        process.exit(1);
      }
    }
  }

  let failures = 0;
  for (const file of files) {
    const rel = path.relative(cwd, file);
    if (!fs.existsSync(file)) {
      console.error(`  ${c.red('✗')} ${rel}  not installed`);
      failures++;
      continue;
    }
    const content = fs.readFileSync(file, 'utf8');
    const updated = setFrontmatter(content, { 'last-verified': today() });
    if (updated === null || !/last-verified:/.test(content)) {
      console.error(`  ${c.red('✗')} ${rel}  no last-verified frontmatter to bump`);
      failures++;
      continue;
    }
    fs.writeFileSync(file, updated);
    console.log(`  ${c.green('✓')} ${rel}  last-verified → ${today()}`);
  }
  if (failures) process.exit(1);
}

// ---------- link ----------

function cmdLink(args) {
  const cwd = process.cwd();
  const force = args.includes('--force');
  const names = positionals(args);
  const keys = names.length ? names : Object.keys(LINK_TOOLS);

  const unknown = keys.filter((k) => !LINK_TOOLS[k]);
  if (unknown.length) {
    console.error(`unknown tool(s): ${unknown.join(', ')}\navailable: ${Object.keys(LINK_TOOLS).join(', ')}`);
    process.exit(1);
  }

  const pointer = readTemplate('POINTER.md');
  const results = { created: [], skipped: [] };
  for (const key of keys) {
    writeDoc(path.join(cwd, LINK_TOOLS[key]), pointer, force, results);
  }
  for (const f of results.created) console.log(`  ${c.green('created')}  ${f}`);
  for (const f of results.skipped) console.log(`  ${c.yellow('skipped')}  ${f} ${c.dim('(exists — use --force to overwrite)')}`);
  console.log(`\n  ${c.dim('Cursor and Codex read AGENTS.md natively; Claude Code uses CLAUDE.md — lore init covers both.')}`);
}

// ---------- ci ----------

function cmdCi(args) {
  const cwd = process.cwd();
  const force = args.includes('--force');
  const target = path.join(cwd, '.github', 'workflows', 'lore-doctor.yml');
  const results = { created: [], skipped: [] };
  writeDoc(target, readTemplate('ci.yml'), force, results);
  for (const f of results.created) console.log(`  ${c.green('created')}  ${f}`);
  for (const f of results.skipped) console.log(`  ${c.yellow('skipped')}  ${f} ${c.dim('(exists — use --force to overwrite)')}`);
  if (results.created.length) {
    console.log(`\n  Doctor exits non-zero on issues, so PRs fail until the docs are healthy.`);
    console.log(`  ${c.dim('The workflow checks out full history — the staleness check reads git dates.')}`);
  }
}

// ---------- list ----------

function cmdList() {
  const cwd = process.cwd();
  console.log(c.bold('\nlore docs\n'));
  const pad = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
  for (const key of Object.keys(MANIFEST)) {
    const m = docMeta(key);
    const p = installedDocPath(cwd, key);
    let status;
    if (fs.existsSync(p)) {
      const fm = parseFrontmatter(fs.readFileSync(p, 'utf8'));
      const v = fm['last-verified'];
      status = c.green('installed') + (v ? c.dim(`  verified ${v}`) : '');
    } else {
      status = c.dim('available');
    }
    console.log(`  ${pad(key, 14)} ${pad(m.tier, 6)} ${status}`);
  }
  const playbooks = walkMd(playbooksDir(cwd)).length;
  const tasks = loadTasks(cwd);
  const extras = [];
  if (playbooks) extras.push(`${playbooks} playbook${playbooks > 1 ? 's' : ''}`);
  if (tasks) extras.push(`${tasks.length} task${tasks.length === 1 ? '' : 's'} (fleet mode)`);
  if (extras.length) console.log(`\n  also: ${extras.join(', ')}`);
  console.log(`\n  add one with: ${c.bold('lore add <doc>')}\n`);
}

// ---------- help / main ----------

function cmdHelp() {
  console.log(`
${c.bold('lore')} ${PKG.version} — give your repo a memory

Scaffolds the markdown docs AI agents read, follow, and keep up to date.
AGENTS.md is the router; lore/ holds the knowledge.

${c.bold('Docs')}
  lore init [--full] [--name <project>] [--force]   scaffold docs in the current repo
  lore doctor [--max-age <days>] [--json]           find stale, missing, or unfinished docs
  lore sync                                         move completed work to done (todo.md and tasks/)
  lore touch <doc...> | all | agents                bump last-verified after re-checking a doc
  lore add <doc...> | all [--force]                 install more docs (updates the read map too)
  lore digest                                       one-page brief of rules + docs — for small contexts
  lore list                                         show installed and available docs

${c.bold('Fleet — many agents, one repo')}
  lore fleet init                                   task files, sessions dir, protocol doc; migrates todo.md
  lore task add <title> [--zone Z] [--priority P] [--depends IDs] [--desc D]
  lore task next [--claim] [--by <agent>] [--zone Z] [--json]
  lore task claim <id> --by <agent>                 claim a specific task
  lore task done <id> · reopen <id> · show <id> · list [--status S] [--zone Z] [--json]

${c.bold('Knowledge for weaker models')}
  lore playbook add <operation>                     capture a step-by-step recipe agents follow exactly
  lore playbook list

${c.bold('Integrations')}
  lore link [copilot gemini windsurf cline]         pointer files so other AI tools read AGENTS.md
  lore ci                                           GitHub Actions workflow that runs doctor on PRs

${c.bold('Tiers')}
  core (default)  AGENTS.md + 7 essential docs — start here
  --full          all ${Object.keys(MANIFEST).length} docs, including pre-filled guides (ui-ux, backend)
  guides          lore add ui-ux backend — detailed best-practice rulebooks, ready to use
`);
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'init': cmdInit(rest); break;
  case 'doctor': cmdDoctor(rest); break;
  case 'sync': cmdSync(rest); break;
  case 'touch': cmdTouch(rest); break;
  case 'add': cmdAdd(rest); break;
  case 'task': cmdTask(rest); break;
  case 'fleet': cmdFleet(rest); break;
  case 'playbook': cmdPlaybook(rest); break;
  case 'digest': cmdDigest(rest); break;
  case 'link': cmdLink(rest); break;
  case 'ci': cmdCi(rest); break;
  case 'list': cmdList(rest); break;
  case 'version': case '--version': case '-v': console.log(PKG.version); break;
  case 'help': case '--help': case '-h': case undefined: cmdHelp(); break;
  default:
    console.error(`unknown command: ${cmd}\n`);
    cmdHelp();
    process.exit(1);
}
