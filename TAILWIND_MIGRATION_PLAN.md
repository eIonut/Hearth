# Dev Hub — Tailwind CSS Migration Plan

Execution plan for an agent. Goal: replace `client/src/styles.css` (~650 lines) with **Tailwind CSS v4** while keeping the app **visually and behaviorally identical**. No feature changes, no redesign, no server changes.

> Note: this supersedes ground rule 5 of `REFACTORING_PLAN.md` ("do not introduce CSS libraries"). That rule protected the refactor from scope creep; the refactor is done, and Tailwind is now an explicit goal.

## Context (verified 2026-07-18)

- Client: Vite 8 + React 19 + react-router 8, plain JSX, single global stylesheet imported once in `client/src/main.jsx` (`import './styles.css'`).
- 27 JSX files use `className`. Styling falls into four buckets:
  1. **Design tokens**: `:root` CSS variables (`--bg`, `--bg-2`, `--bg-3`, `--border`, `--text`, `--muted`, `--accent`, `--green`, `--red`, plus orange `#d29922` used raw).
  2. **Element-level base styles** (no class): `body`, `h2`, `h3`, `label`, `input`, `textarea`, `select`, `a`.
  3. **Reused primitives with dynamic variants**: `.btn` (+ `primary/danger/danger-solid/small`), `.chip` (+ `green/gray/orange/red`), `.dot` (+ `green/gray/orange/red`), `.card` (+ `compact/empty/stat`), `.subnav`/`.subnav-item`, `.nav-item`, `.tab`. Variants are composed at runtime: `'btn small ' + (running ? 'danger' : 'primary')`.
  4. **One-off layout/page styles**: app shell, workspace, TIL bar, content pipeline grid, learning board, digest stats, modal (with two keyframe animations), logs.
- Other CSS in play: `@xterm/xterm/css/xterm.css` (imported by `TermView.jsx` — untouched by this plan), `ansi_up` inline styles in logs (unaffected).
- One media query: `.content-layout` collapses at `max-width: 900px`.
- Prettier 3 with `.prettierrc`; ESLint 9 flat config; CI runs lint + client build + vitest.

### Target versions (latest on npm as of 2026-07-18 — re-check at execution time)

| Package                     | Version | Notes                                       |
| --------------------------- | ------- | ------------------------------------------- |
| tailwindcss                 | ^4.3.3  | v4: CSS-first config, no `tailwind.config.js` |
| @tailwindcss/vite           | ^4.3.3  | first-party Vite plugin (no PostCSS setup)  |
| prettier-plugin-tailwindcss | ^0.8.1  | class sorting (Phase 5)                     |

## Strategy decisions (settled — don't relitigate mid-migration)

1. **Tailwind v4, CSS-first.** No `tailwind.config.js`. Tokens live in an `@theme` block in the CSS entry file. Content scanning is automatic in v4 (respects `.gitignore`).
2. **Three-tier approach**, matching how the CSS is actually used:
   - Tokens → `@theme` variables (`--color-bg`, `--color-accent`, …). Tailwind emits them as CSS variables, so the few places that need raw `var()` (e.g. box-shadow glows) keep working.
   - Element base styles (`body`, headings, forms, links) → a small `@layer base` block. These are *intentionally* global (every `<input>` in the app is styled identically); adding 10 utility classes to every input would be strictly worse.
   - Reused primitives (`.btn`, `.chip`, `.dot`, `.card`, `.subnav*`, `.nav-item`, `.tab`) → keep as classes, redefined with `@apply` in `@layer components`. **Rationale:** call sites compose variants dynamically (`'chip ' + color`, `'btn small ' + (running ? 'danger' : 'primary')`); converting these to inline utilities would require touching every call site's logic and inventing a `cn()`/variant helper — a bigger diff for zero behavior gain. This is the pragmatic subset of Tailwind for a small app.
   - Everything else (one-off layout: `.app`, `.sidebar`, `.workspace-page`, `.til-bar`, `.content-layout`, `.board`, `.stats-grid`, `.modal*`, `.logs`, etc.) → **inline utilities in JSX**, deleting the CSS rules as you go.
3. **Full literal class names only.** Tailwind's scanner can't see interpolated fragments. `'dot ' + (running ? 'green' : 'red')` is fine while `dot`/`green` are `@layer components` classes, but any *utility* chosen at runtime must be a complete literal in source (`running ? 'bg-green' : 'bg-red'`, never `` `bg-${color}` ``).
4. **Keyframes** (`modal-fade`, `modal-pop`) → `@theme` `--animate-*` definitions, applied via `animate-modal-fade` / `animate-modal-pop` utilities.
5. **Breakpoint**: use `max-[900px]:grid-cols-1` for the one media query — not worth a named breakpoint.
6. **Preflight stays on.** It overlaps the existing `* { margin:0; padding:0; box-sizing:border-box }` reset. Import order in the entry CSS: Tailwind first, then (during migration) the legacy `styles.css` so unmigrated rules win. Known Preflight deltas to check in Phase 0: buttons lose `cursor: pointer`-adjacent assumptions (the app sets cursor per class — fine), `h2`/`h3` lose default margins/size (the app overrides — keep those overrides in `@layer base`), placeholder color, `img` display.

## Ground rules

1. **One phase per commit.** Each commit leaves the app pixel-equivalent (or with a noted, deliberate ≤1px-class delta).
2. **Verify after every phase**: `npm --prefix client run build` must pass, then boot and eyeball every page (checklist at bottom). Don't rely on the preview harness's injected `PORT` (it breaks the API proxy — see memory note); use `npm run dev` from the repo root and probe `http://localhost:5173`.
3. Behavior-preserving: no markup restructuring beyond class changes, no renamed components, no server or data changes.
4. `styles.css` shrinks monotonically; a rule is deleted in the same commit that migrates its last consumer. Grep before deleting.

---

## Phase 0 — Install + coexistence baseline

1. `npm --prefix client i -D tailwindcss @tailwindcss/vite`.
2. `client/vite.config.js`: add `tailwindcss()` from `@tailwindcss/vite` to `plugins`.
3. Create `client/src/index.css`:
   ```css
   @import 'tailwindcss';
   @import './styles.css'; /* legacy — shrinks to zero over this migration */
   ```
   Swap `main.jsx` to `import './index.css'`.
4. Boot the app. Walk every page and fix any Preflight regressions by adding the minimal counter-rule to a new `@layer base` block in `index.css` (expected candidates: heading margins are already overridden in styles.css so likely nothing; check form controls, `a` colors in unmigrated areas, `hr`/`fieldset` if any).
5. Commit: "Tailwind v4 installed, coexisting with legacy styles.css — zero visual change".

## Phase 1 — Tokens + base layer

1. Add `@theme` to `index.css` mapping the existing palette 1:1:
   ```css
   @theme {
     --color-bg: #0d1117;
     --color-bg-2: #161b22;
     --color-bg-3: #21262d;
     --color-border: #30363d;
     --color-text: #e6edf3;
     --color-muted: #8b949e;
     --color-accent: #2f81f7;
     --color-green: #3fb950;
     --color-red: #f85149;
     --color-orange: #d29922; /* today a raw hex in chips/dots — tokenize it */
     --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
     --font-mono: Menlo, Monaco, monospace;
     --animate-modal-fade: modal-fade 0.12s ease-out;
     --animate-modal-pop: modal-pop 0.12s ease-out;
     @keyframes modal-fade { /* … copy from styles.css … */ }
     @keyframes modal-pop { /* … */ }
   }
   ```
   This yields utilities like `bg-bg-2`, `text-muted`, `border-border`, `text-accent`, `font-mono`.
2. Move element base styles from `styles.css` into `@layer base` in `index.css`, expressed with `@apply` where clean (`body`, `h2`, `h3`, `label`, `input/textarea/select` incl. `:focus`, `a`). Delete them from `styles.css` along with the `:root` block **only after** confirming nothing references the old `--bg`-style names — the box-shadow glows (`.dot.green`, `.crash-badge`) and rgba chips still live in `styles.css` at this point and reference `var(--green)` etc.; either keep `:root` until Phase 3 removes the last consumer, or alias old names to the new theme vars in `:root` (`--green: var(--color-green)`) and delete the aliases in Phase 3. Prefer the alias — it makes the final deletion greppable.
3. Verify + commit.

## Phase 2 — Primitives as `@layer components`

Recreate in `index.css` under `@layer components`, using `@apply` with theme utilities, then delete from `styles.css`:

- `.btn` + `.primary`, `.danger`, `.danger-solid`, `.small` (keep the awkward `margin-left: 4px` — parity first, cleanup later)
- `.chip` + color variants (rgba backgrounds: use Tailwind opacity syntax, e.g. `@apply bg-green/15 text-green`)
- `.dot` + color variants (keep the `box-shadow: 0 0 6px` glow — plain CSS inside the rule is fine where `@apply` has no equivalent)
- `.card` + `.compact`, `.empty`, `.stat`
- `.nav-item` (+ `.active`), `.subnav`/`.subnav-item` (+ `.small`, `.active`), `.tab`/`.tab-close`/`.tab-glyph` (+ `.active`)
- Text utilities `.mono`, `.muted`, `.small-text`, `.error`, `.success`: **delete instead** — replace call sites with real utilities (`font-mono`, `text-muted`, `text-xs`, `text-red`, `text-green`). These are 1:1 utility duplicates, not components. (`.error`/`.success` carry `margin: 6px 0` — use `my-1.5 text-red`.)
- `.row`, `.spacer`, `.space-between`: same — replace with `flex gap-2 items-center flex-wrap my-1.5`, `flex-1`, `justify-between` at call sites. High call-site count; do it mechanically (grep-driven), one commit.

No visual change expected. Verify + commit (can be 2–3 commits: primitives / text utils / row utils).

## Phase 3 — One-off styles → inline utilities, per area

One commit per area; delete the corresponding `styles.css` section in the same commit:

1. **App shell**: `.app`, `.sidebar` (+ `.collapsed` — conditional utilities in `Sidebar.jsx`), `.logo*`, `.collapse-btn`, `.sidebar-footer`, `.content`, `.page-area`, `.page`.
2. **TIL bar + content pipeline**: `.til-bar`, `.til-label`, `.content-layout` (with `max-[900px]:grid-cols-1`), `.til-column`, `.board`, `.column h3` (becomes a class on the h3).
3. **Projects**: `.grid`, `.service-row` (`first-of-type` border → `first:border-t-0`), `.service-name`, `.logs`, `.log-panel`, `.snippet-body`, `.crash-badge`, `.op-editor`, `.tag`, `.search`.
4. **Workspace**: `.workspace-page`, `.workspace-toolbar` (its child `select`/`input` overrides become classes on those elements), `.tab-bar`, `.work-area`, `.term-container`, `.preview-frame-wrap`, `.preview-iframe`, `.preview-notice`, `.btn a`/`a.btn` link-color override.
5. **Digest + modal**: `.stats-grid`, `.stat-value`, `.summary-text`, `.modal-overlay`/`.modal`/`.modal-title`/`.modal-message`/`.modal-actions` (use `animate-modal-fade`/`animate-modal-pop` from Phase 1).

After this phase `styles.css` is empty → delete the file and inline the `@import` removal.

## Phase 4 — Tooling + docs

1. `npm i -D prettier-plugin-tailwindcss` (root), add to `.prettierrc` `plugins`; run `npm run format` (dedicated "format only" commit — it will reorder class strings repo-wide).
2. ESLint: no plugin needed (optional: note `eslint-plugin-better-tailwindcss` as future work; don't add now).
3. README: update the architecture blurb (styling section: "Tailwind v4, tokens in `client/src/index.css` `@theme`, shared primitives in `@layer components`"). Remove/adjust any "no CSS libraries" phrasing in README/CONTRIBUTING, and add the supersession note to `REFACTORING_PLAN.md` if not already done.
4. `npm audit` sanity check; confirm CI green (no CI changes needed — build already covers Tailwind compilation).

---

## Verification checklist (after every phase)

`npm run dev` from repo root, open http://localhost:5173:

- [ ] `npm --prefix client run build` succeeds; no console warnings about unknown classes
- [ ] Projects: cards, green/red/gray dots **with glow**, chips (all 4 colors), service rows, logs panel styling, form inputs + focus ring
- [ ] Sidebar: active nav highlight, collapse/expand, crash badge
- [ ] Workspace: tab bar active state, terminal container fills height, preview iframe, toolbar select/input sizing
- [ ] Content: TIL bar, pipeline two-column layout (and single-column below 900px), learning board, digest stat cards
- [ ] Library: snippets mono body, tags, search width
- [ ] Confirm dialog: overlay + pop animation, danger-solid button
- [ ] Diff-check: side-by-side screenshot comparison against `main` for at least Projects + Workspace
- [ ] Grep `styles.css` (while it exists) and JSX for orphaned class names: every class deleted from CSS must have zero remaining `className` references, and vice versa
