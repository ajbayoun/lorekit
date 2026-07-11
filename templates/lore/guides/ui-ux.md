---
doc: ui-ux
title: UI/UX guide
summary: Universal interface rules — layout, type, color, states, forms, accessibility
last-verified: {{DATE}}
read-when: building or changing ANY user interface — screens, components, copy, emails
update-when: the project adopts a rule that differs from these defaults (edit in place, note it in decisions.md)
---

# UI/UX guide

Universal rules, pre-filled with strong defaults. They exist so that every
agent — regardless of model — produces interfaces that look intentional.
Follow them mechanically unless this project's `design.md`/`brand.md`
overrides a rule. When in doubt: fewer elements, more whitespace, one accent.

## Layout & spacing

- Use a **single spacing scale** and nothing off-scale: 4, 8, 12, 16, 24, 32,
  48, 64px. If you're typing `13px` or `27px`, you're wrong.
- Space BETWEEN groups must be larger than space WITHIN groups (proximity is
  hierarchy). Related items: 8–12px apart. Separate sections: 32–48px apart.
- One primary content column, max-width **640–760px for text**, 1100–1280px
  for app layouts. Never let paragraphs run full-bleed on wide screens.
- Align to a grid: every edge lines up with something else. If an element's
  left edge aligns with nothing, move it until it does.
- Padding inside a container ≥ the gap between its children.
- Whitespace is not wasted space. When a screen feels bad, remove elements
  and add space before adding decoration.

## Typography

- **Maximum 2 font families** (one is better): one for UI/body, optionally
  one for headings or code.
- Establish a scale and stick to it: 12 (fine print), 14 (secondary), 16
  (body — never smaller for reading text), 20, 24, 32, 40 (display).
- Line height: 1.5 for body text, 1.2 for headings. Line length: 45–75
  characters.
- Hierarchy through **weight and size, not color variety**: body 400,
  emphasis 500–600, headings 600–700.
- Secondary text: same hue as body text, reduced opacity/lightness — not a
  new gray each time. Two levels of "muted" maximum.
- Never justify text. Never center-align paragraphs (centering is for short
  headings and empty states only).

## Color

- Build from **one neutral ramp + one accent + semantic colors**
  (success/warning/danger). More than one accent needs a reason in brand.md.
- Contrast minimums (WCAG AA): **4.5:1** for body text, **3:1** for large
  text (≥24px) and UI components/borders. Check, don't eyeball.
- Don't use pure black (#000) on pure white — use a very dark gray (e.g.
  #111–#1a1a1a) to reduce glare. Same for dark mode: background #0f–#1a
  range, not #000.
- Color is never the only signal: pair it with an icon, label, or weight
  change (colorblind users, grayscale printing).
- Saturated colors advance, muted colors recede: the accent goes on the ONE
  action you want taken, not on decoration.

## The five states rule

Every view that shows data has five states. Shipping only the ideal state is
a bug, not a shortcut. Design all of:

1. **Loading** — skeleton or spinner; keep layout stable (no jumping when
   data arrives). Prefer skeletons for content, spinners for actions.
2. **Empty** — first-run: one sentence about what will appear here + the
   action to make it appear. Never a blank region, never just "No data".
3. **Error** — what failed, in human words, and what to do next (retry
   button, support link). Never show a raw exception or status code alone.
4. **Partial** — 1 item and 10,000 items both look intentional: cap heights,
   paginate or virtualize long lists, truncate long strings with tooltips.
5. **Ideal** — the one you were going to build anyway.

## Forms

- Labels **above** fields, always visible. Placeholder text is NOT a label —
  it disappears on input.
- Validate on **blur or submit**, never on every keystroke while the user is
  still typing their first attempt. Once a field has errored, re-validate on
  change so the error clears immediately when fixed.
- Error messages: next to the field, specific and actionable — "Password
  needs at least 8 characters", not "Invalid input".
- Mark **optional** fields, not required ones (most fields should be
  required; if most are optional, cut them).
- One column of fields. Group related fields with section headings at 2×
  the field gap.
- Submit button states: default → disabled-while-submitting with a spinner →
  success/error feedback. Never leave a clickable button during an in-flight
  submit (double-submit bug).
- Destructive actions: never the default focus, visually distinct (danger
  color), confirm with the consequence spelled out ("Delete 14 files?"), and
  put the safe choice first.

## Interaction

- Touch targets ≥ **44×44px** (mobile) / clickable area ≥ 32px (desktop),
  even if the visible element is smaller.
- Every interactive element has visible **hover, focus, active, and
  disabled** states. Focus rings are mandatory — never `outline: none`
  without a visible replacement.
- Motion: 150–250ms for micro-interactions, ease-out for entering,
  ease-in for exiting. Nothing over 400ms. Respect
  `prefers-reduced-motion` — gate all non-essential animation behind it.
- Feedback within 100ms of any click (state change, spinner, ripple) —
  perceived slowness is a missing acknowledgment, not a slow server.
- Async actions: optimistic UI where reversal is easy (toggles, likes),
  pessimistic with progress where it isn't (payments, deletes).
- Never trap the user: every modal closes with Esc and an X; every flow has
  a way back; every filter has "clear".

## Copy

- Buttons say what they do, in verb form: "Save changes", "Create project" —
  never "OK", "Submit", "Yes".
- Sentence case everywhere ("Add new member", not "Add New Member") unless
  brand.md says otherwise.
- Talk to the user as "you"; refer to the product as "we" sparingly.
- Error copy: what happened → why (if known) → what to do. No blame ("you
  entered an invalid..."), no jargon (no "Error 422").
- Cut every word that survives cutting. "In order to" → "To". "You are able
  to" → "You can".

## Accessibility checklist (ship-blocking)

- [ ] Full keyboard path: every action reachable by Tab/Enter/Esc, focus
      order matches visual order, focus visible at all times.
- [ ] All images have `alt` (empty `alt=""` for decorative); all inputs have
      programmatic labels; icon-only buttons have `aria-label`.
- [ ] Contrast passes (4.5:1 text, 3:1 UI) in light AND dark themes.
- [ ] Page has one `h1`; heading levels don't skip; landmarks
      (`main`, `nav`) present.
- [ ] Dynamic updates announce themselves (`aria-live` for toasts, counts,
      async results).
- [ ] Works at 200% zoom and 320px width without horizontal scrolling.

## Before shipping any UI change

- [ ] All five states exist and were actually rendered once.
- [ ] Keyboard-only walkthrough done.
- [ ] Checked at mobile width and desktop width.
- [ ] Checked in dark mode (if the app has one).
- [ ] No spacing values off the scale; no new one-off grays or accents.

## Project overrides

Rules above that this project deliberately breaks, and why:

- (none yet)
