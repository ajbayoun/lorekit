---
description: Scaffold lore docs (AGENTS.md + lore/) in this repo, then interview the user to fill them in
---

Initialize lore in the current repository, then fill it with real content:

1. Run `npx -y lorekit init` (add `--full` if the user asked for the full doc
   set, `$ARGUMENTS` may contain flags to pass through). Show the user what
   was created.
2. Read the generated AGENTS.md so you know the lifecycle rules.
3. Explore the repo (code, git history, existing README) and pre-fill every
   `_FILL_ME_` placeholder you can answer with certainty from the code itself
   — stack, commands, file map, dependencies.
4. For everything you cannot know from code — mission, goals, personas,
   budget, brand — interview the user with short, concrete questions. A few
   at a time, not a wall of questions. Write their answers into the docs.
5. Finish by running `npx -y lorekit doctor` and reporting what is still open.

Never guess placeholder content. `_FILL_ME_` that you can't verify from the
repo stays until the user answers.
