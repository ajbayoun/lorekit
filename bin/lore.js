#!/usr/bin/env node
'use strict';

/*
 * lore — give your repo a memory.
 * Scaffolds and maintains the markdown docs AI agents read, follow,
 * and keep up to date. No dependencies, Node >= 16.
 */

const fs = require('fs');
const path = require('path');

const PKG = require(path.join(__dirname, '..', 'package.json'));
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(TEMPLATES_DIR, 'manifest.json'), 'utf8')
).docs;

const LORE_DIR = 'lore';
const FILL_MARKER = '_FILL_ME_';
const DEFAULT_MAX_AGE_DAYS = 30;

// ---------- small helpers ----------

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
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

// ---------- init / add ----------

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

function buildManifestTable(keys) {
  const rows = keys.map((k) => {
    const m = docMeta(k);
    return `| [\`lore/${m.file}\`](lore/${m.file}) — ${m.title} | ${m.readWhen} | ${m.updateWhen} |`;
  });
  return [
    '| Doc | Read it when | Update it when |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n');
}

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
  const keys =
    targets[0] === 'all'
      ? Object.keys(MANIFEST)
      : targets;

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
    console.log(`\n  ${c.yellow('note')}  new docs are not yet in the AGENTS.md read map — add a row for each.`);
  }
}

// ---------- doctor ----------

function cmdDoctor(args) {
  const cwd = process.cwd();
  const maxAgeIdx = args.indexOf('--max-age');
  const maxAge =
    maxAgeIdx !== -1 && args[maxAgeIdx + 1]
      ? parseInt(args[maxAgeIdx + 1], 10)
      : DEFAULT_MAX_AGE_DAYS;

  let problems = 0;
  const report = (level, file, msg) => {
    const icon = level === 'error' ? c.red('✗') : c.yellow('!');
    console.log(`  ${icon} ${file}  ${msg}`);
    problems++;
  };

  console.log(c.bold(`\nlore doctor ${c.dim(`(max staleness: ${maxAge} days)`)}\n`));

  const agentsPath = path.join(cwd, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    report('error', 'AGENTS.md', 'missing — run "lore init"');
    process.exit(1);
  }

  const files = [agentsPath, ...listLoreFiles(cwd)];
  const now = Date.now();

  for (const file of files) {
    const rel = path.relative(cwd, file);
    const content = fs.readFileSync(file, 'utf8');
    const fm = parseFrontmatter(content);

    if (!fm['last-verified']) {
      report('warn', rel, 'no "last-verified" date in frontmatter');
    } else {
      const verified = Date.parse(fm['last-verified']);
      if (Number.isNaN(verified)) {
        report('warn', rel, `unparseable last-verified date: "${fm['last-verified']}"`);
      } else {
        const ageDays = Math.floor((now - verified) / 86400000);
        if (ageDays > maxAge) {
          report('warn', rel, `stale — last verified ${ageDays} days ago`);
        }
      }
    }

    // Bare markers only — `_FILL_ME_` in backticks is documentation, not a placeholder.
    const fills = (content.match(new RegExp(`(?<!\`)${FILL_MARKER}(?!\`)`, 'g')) || []).length;
    if (fills > 0) {
      report('warn', rel, `${fills} ${FILL_MARKER} placeholder${fills > 1 ? 's' : ''} remaining`);
    }
  }

  const todoPath = path.join(cwd, LORE_DIR, 'todo.md');
  if (fs.existsSync(todoPath)) {
    const done = (fs.readFileSync(todoPath, 'utf8').match(/^\s*- \[x\]/gim) || []).length;
    if (done > 0) {
      report('warn', 'lore/todo.md', `${done} completed task${done > 1 ? 's' : ''} not yet moved to done.md — run "lore sync"`);
    }
  }

  if (problems === 0) {
    console.log(`  ${c.green('✓')} all lore docs present, fresh, and filled in\n`);
  } else {
    console.log(`\n  ${problems} issue${problems > 1 ? 's' : ''} found\n`);
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
    // Append to today's existing section.
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
  lore doctor [--max-age <days>]                    find stale, missing, or unfinished docs
  lore sync                                         move completed [x] tasks from todo.md to done.md
  lore add <doc...> | all [--force]                 install additional docs
  lore list                                         show installed and available docs
  lore help                                         this message

${c.bold('Tiers')}
  core (default)  AGENTS.md + 7 essential docs — start here
  --full          everything: ${Object.keys(MANIFEST).length} docs covering ops, design, security, costs, and more
`);
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'init': cmdInit(rest); break;
  case 'doctor': cmdDoctor(rest); break;
  case 'sync': cmdSync(rest); break;
  case 'add': cmdAdd(rest); break;
  case 'list': cmdList(rest); break;
  case 'version': case '--version': case '-v': console.log(PKG.version); break;
  case 'help': case '--help': case '-h': case undefined: cmdHelp(); break;
  default:
    console.error(`unknown command: ${cmd}\n`);
    cmdHelp();
    process.exit(1);
}
