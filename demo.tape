# ============================================================================
#  loresmith — README demo   (charmbracelet/vhs)
#  Render:  vhs demo.tape        ->  demo.gif
#
#  Prereqs the tape assumes (kept OFF-camera in the Hide block below):
#    - `loresmith` is installed so `npx loresmith` / `lore` resolve offline.
#      In the hidden setup we `npm i -g` from the repo checkout; point
#      LORESMITH_REPO at your clone, or `npm i -g loresmith@0.3.0` once
#      published and delete that line.
#  Everything the viewer sees is the REAL CLI output — nothing is faked.
#  The only sleight of hand is a hidden "agent fills the docs" step between
#  scene 3 (fleet claim) and scene 4 (all-green) — that's the story: the
#  agent claimed a task, did the work, and doctor now passes.
# ============================================================================

Output demo.gif

# ---- canvas ----------------------------------------------------------------
Set Shell        bash
Set FontFamily   "JetBrains Mono"
Set FontSize     28
Set Width        1200
Set Height       760
Set Padding      40
Set TypingSpeed  38ms
Set LineHeight   1.35

# ---- palette (matches the brand + the CLI's real ANSI codes) --------------
#   bg #0f1115 · fg #c9d1d9 · dim #6e7681 · ember caret #ff5b1e
#   green(32) #26d07c · yellow(33) #e3b341 · red(31) #ff5f56
Set Theme { "background": "#0f1115", "foreground": "#c9d1d9", "cursor": "#ff5b1e", "selection": "#243040", "black": "#0f1115", "red": "#ff5f56", "green": "#26d07c", "yellow": "#e3b341", "blue": "#539bf5", "magenta": "#c297ff", "cyan": "#39c5cf", "white": "#c9d1d9", "brightBlack": "#6e7681", "brightRed": "#ff8079", "brightGreen": "#56e39a", "brightYellow": "#f0c674", "brightBlue": "#77b3ff", "brightMagenta": "#d3b0ff", "brightCyan": "#6ad7de", "brightWhite": "#e6edf3" }

# ============================================================================
#  HIDDEN SETUP  (off-camera): a fresh demo repo with a Node + Docker stack
# ============================================================================
Hide
Type "export PS1='\033[38;5;208m❯\033[0m '" Enter
Type "cd $(mktemp -d) && git init -q" Enter
Type `printf '{\n  "name": "demo-app",\n  "version": "1.0.0"\n}\n' > package.json` Enter
Type `printf 'FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node","server.js"]\n' > Dockerfile` Enter
Type "git add -A && git commit -qm 'init demo-app'" Enter
# make `npx loresmith` / `lore` resolve to the local build, offline
Type "npm i -g ${LORESMITH_REPO:-loresmith@0.3.0} >/dev/null 2>&1" Enter
Type "clear" Enter
Show

# ============================================================================
#  SCENE 1 — scaffold the memory        `npx loresmith init`
# ============================================================================
Type "npx loresmith init" Sleep 400ms Enter
Sleep 2s

# ============================================================================
#  SCENE 2 — doctor finds stale/empty docs (yellow), exits 1   `lore doctor`
# ============================================================================
Type "lore doctor" Sleep 400ms Enter
Sleep 2500ms

# ============================================================================
#  SCENE 3 — the fleet moment: init + claim the next task
# ============================================================================
Type "lore fleet init" Sleep 300ms Enter
Sleep 1500ms
Type "lore task next --claim --by agent-07" Sleep 300ms Enter
Sleep 2800ms

# ---- HIDDEN: agent-07 does the work, fills the docs -----------------------
Hide
Type "grep -rl _FILL_ME_ lore | xargs -r sed -i 's/_FILL_ME_/documented by agent-07/g'" Enter
Type "clear" Enter
Show

# ============================================================================
#  SCENE 4 — doctor is all green ✓        `lore doctor`
# ============================================================================
Type "lore doctor" Sleep 400ms Enter
Sleep 2200ms

# ---- END CARD --------------------------------------------------------------
Type "clear" Enter
Sleep 200ms
Type `printf '  \033[38;5;252mloresmith\033[38;5;208m█\033[0m  —  give your repo a memory\n\n  \033[2mgithub.com/ajbayoun/loresmith\033[0m\n'` Enter
Sleep 2800ms
