---
description: Capture the operation you just completed as a step-by-step playbook other agents can follow exactly
---

Turn work you just did (or are about to explain) into a reusable recipe:

1. Identify the repeatable operation — e.g. "add an API endpoint", "add a
   database migration", "create a new screen". If `$ARGUMENTS` names one,
   use that.
2. Run `npx -y loresmith playbook add <operation name>`.
3. Fill the generated file in `lore/playbooks/` from what actually happened
   in this session, not from theory:
   - **Golden example**: the best existing file that shows the finished
     pattern — future agents copy it.
   - **Steps**: exact paths and commands, numbered, no ambiguity. Write for
     a less capable model: if a step requires judgment, split it until it
     doesn't.
   - **Verify**: the command that proves it worked, with expected output.
   - **Common failures**: every error you hit along the way, with the fix.
4. Keep it honest — if you didn't verify a step, don't write it as fact.

Playbooks are the repo's way of making every future agent as good as the
one that solved the problem first.
