#!/usr/bin/env node
'use strict';

/*
 * lore — give your repo a memory.
 * Scaffolds and maintains the markdown docs AI agents read, follow,
 * and keep up to date. No dependencies, Node >= 16.
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

function render(content, vars) {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? vars[key] : `{{${key}}}`
  );
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

function listLoreFiles(cwd) {
  const dir = path.join(cwd, LORE_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(dir, f));
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
    readWhen: fm['read-when'] || '',
    updateWhen: fm['update-when'] || '',
  };
}

function rowFor(key) {
  const m = docMeta(key);
  return `| [\`lore/${m.file}\`](lore/${m.file}) — ${m.title} | ${m.readWhen} | ${m.updateWhen} |`;
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
  return [...section.matchAll(/lore\/([\w.-]+\.md)/g)].map((m) => m[1]);
}

function insertReadMapRows(agentsPath, keys) {
  let content = fs.readFileSync(agentsPath, 'utf8');
  const mapped = readMapFiles(content);
  if (mapped === null) return false;
  const newKeys = keys.filter((k) => !mapped.includes(MANIFEST[k].file));
  if (!newKeys.length) return true;

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

  lines.splice(lastRow + 1, 0, ...newKeys.map(rowFor));
  fs.writeFileSync(agentsPath, lines.join('\n'));
  return true;
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
  const nameIdx = args.indexOf('--name');
  const projectName =
    nameIdx !== -1 && args[nameIdx + 1]
      ? args[nameIdx + 1]
      : path.basename(cwd);

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
  ${c.dim('Optional: "lore ci" gates PRs on doctor; "lore link" covers Copilot, Gemini, Windsurf, Cline.')}
`);
}

function cmdAdd(args) {
  const cwd = process.cwd();
  const force = args.includes('--force');
  const targets = args.filter((a) => !a.startsWith('--'));
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
  const maxAgeIdx = args.indexOf('--max-age');
  const maxAge =
    maxAgeIdx !== -1 && args[maxAgeIdx + 1]
      ? parseInt(args[maxAgeIdx + 1], 10)
      : DEFAULT_MAX_AGE_DAYS;

  const issues = [];
  const add = (file, type, message) => issues.push({ file, type, message });
  const stats = { scanned: 0, stale: 0, placeholders: 0, unsyncedTasks: 0 };

  const agentsPath = path.join(cwd, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    add('AGENTS.md', 'missing', 'missing — run "lore init"');
    return finishDoctor(json, maxAge, issues, stats);
  }

  const files = [agentsPath, ...listLoreFiles(cwd)];
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
    const onDisk = listLoreFiles(cwd).map((f) => path.basename(f));
    for (const f of onDisk) {
      if (!mapped.includes(f)) {
        add(`lore/${f}`, 'orphan', "not in the AGENTS.md read map — agents won't find it");
      }
    }
    for (const f of mapped) {
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

  finishDoctor(json, maxAge, issues, stats);
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
  if (!issues.length) {
    console.log(`  ${c.green('✓')} all lore docs present, fresh, and filled in ${c.dim(`(${stats.scanned} scanned)`)}\n`);
  } else {
    console.log(`\n  ${issues.length} issue${issues.length > 1 ? 's' : ''} found ${c.dim(`(${stats.scanned} docs scanned)`)}\n`);
    process.exit(1);
  }
}

// ---------- sync ----------

function cmdSync() {
  const cwd = process.cwd();
  const todoPath = path.join(cwd, LORE_DIR, 'todo.md');
  const donePath = path.join(cwd, LORE_DIR, 'done.md');

  if (!fs.existsSync(todoPath)) {
    console.error('lore/todo.md not found — run "lore init" first');
    process.exit(1);
  }

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

  if (!moved.length) {
    console.log('nothing to sync — no completed tasks in lore/todo.md');
    return;
  }

  let done = fs.existsSync(donePath)
    ? fs.readFileSync(donePath, 'utf8')
    : '# Done\n';
  const heading = `## ${today()}`;
  if (done.includes(heading)) {
    const idx = done.indexOf(heading) + heading.length;
    done =
      done.slice(0, idx) +
      '\n' +
      moved.map((m) => `- ${m}`).join('\n') +
      done.slice(idx);
  } else {
    if (!done.endsWith('\n')) done += '\n';
    done += `\n${heading}\n${moved.map((m) => `- ${m}`).join('\n')}\n`;
  }

  fs.writeFileSync(donePath, done);
  fs.writeFileSync(todoPath, kept.join('\n'));
  console.log(`moved ${moved.length} task${moved.length > 1 ? 's' : ''} to lore/done.md:`);
  for (const m of moved) console.log(`  ${c.green('✓')} ${m}`);
}

// ---------- touch ----------

function cmdTouch(args) {
  const cwd = process.cwd();
  const targets = args.filter((a) => !a.startsWith('--'));
  if (!targets.length) {
    console.error('usage: lore touch <doc...> | all | agents\nonly touch docs you have actually re-checked against the code');
    process.exit(1);
  }

  let files = [];
  if (targets[0] === 'all') {
    files = [path.join(cwd, 'AGENTS.md'), ...listLoreFiles(cwd)].filter((f) => fs.existsSync(f));
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
    const fmBlock = content.match(/^---\n[\s\S]*?\n---/);
    if (!fmBlock || !/last-verified:/.test(fmBlock[0])) {
      console.error(`  ${c.red('✗')} ${rel}  no last-verified frontmatter to bump`);
      failures++;
      continue;
    }
    const updated = fmBlock[0].replace(/last-verified:.*/, `last-verified: ${today()}`);
    fs.writeFileSync(file, content.replace(fmBlock[0], updated));
    console.log(`  ${c.green('✓')} ${rel}  last-verified → ${today()}`);
  }
  if (failures) process.exit(1);
}

// ---------- link ----------

function cmdLink(args) {
  const cwd = process.cwd();
  const force = args.includes('--force');
  const names = args.filter((a) => !a.startsWith('--'));
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
  console.log(`\n  add one with: ${c.bold('lore add <doc>')}\n`);
}

// ---------- help / main ----------

function cmdHelp() {
  console.log(`
${c.bold('lore')} ${PKG.version} — give your repo a memory

Scaffolds the markdown docs AI agents read, follow, and keep up to date.
AGENTS.md is the router; lore/ holds the knowledge.

${c.bold('Usage')}
  lore init [--full] [--name <project>] [--force]   scaffold docs in the current repo
  lore doctor [--max-age <days>] [--json]           find stale, missing, or unfinished docs
  lore sync                                         move completed [x] tasks from todo.md to done.md
  lore touch <doc...> | all | agents                bump last-verified after re-checking a doc is accurate
  lore add <doc...> | all [--force]                 install more docs (also updates the AGENTS.md read map)
  lore link [copilot gemini windsurf cline]         pointer files so other AI tools read AGENTS.md
  lore ci                                           GitHub Actions workflow that runs doctor on PRs
  lore list                                         show installed and available docs
  lore help                                         this message

${c.bold('Tiers')}
  core (default)  AGENTS.md + 7 essential docs — start here
  --full          everything: ${Object.keys(MANIFEST).length} docs covering ops, design, security, costs, and more

${c.bold('Staleness is git-aware')}
  A doc past --max-age only counts as stale if the repo has commits newer than
  its last-verified date — dormant repos stay quiet.
`);
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'init': cmdInit(rest); break;
  case 'doctor': cmdDoctor(rest); break;
  case 'sync': cmdSync(rest); break;
  case 'touch': cmdTouch(rest); break;
  case 'add': cmdAdd(rest); break;
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
