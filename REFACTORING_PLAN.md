# Dev Hub — Refactoring Plan

This document is an execution plan for an agent. Goal: bring the codebase to a state fit for a public open-source release — latest dependency versions, clear separation of concerns, consistent tooling — **without changing user-facing behavior or the on-disk data formats** (`data/*.json`, `envs/`, patch definitions).

## Context (current state, verified 2026-07-18)

- **App**: personal local dev hub. Express server (`server/`, CommonJS, port 5001, localhost-only) + React SPA (`client/`, Vite, ESM). WebSocket terminals via `node-pty` + `@xterm/xterm`. Data persisted as JSON files via `server/lib/store.js`. Optional Claude features via `@anthropic-ai/claude-agent-sdk`.
- **No tests, no linting, no formatting config, no CI.**
- **The working tree has uncommitted changes** (a nav restructure: pages deleted/added). Nothing here may be discarded.
- Largest files: `client/src/pages/Projects.jsx` (366 lines, 5 components), `client/src/styles.css` (329), `client/src/pages/Workflows.jsx` (252), `client/src/pages/Workspace.jsx` (234, 3 components), `server/lib/terminals.js` (232).

### Dependency versions: current → target (latest on npm as of 2026-07-18)

| Package                        | Current | Target   | Jump                       |
| ------------------------------ | ------- | -------- | -------------------------- |
| express                        | ^4.19.2 | ^5.2.1   | **major**                  |
| ws                             | ^8.17.0 | ^8.21.1  | minor                      |
| concurrently                   | ^9.0.0  | ^10.0.3  | major (Node 20+)           |
| node-pty                       | ^1.1.0  | ^1.1.0   | current                    |
| @anthropic-ai/claude-agent-sdk | ^0.1.0  | ^0.3.214 | **major (0.x)**            |
| react / react-dom              | ^18.3.1 | ^19.2.7  | **major**                  |
| vite                           | ^5.4.0  | ^8.1.5   | **3 majors**               |
| @vitejs/plugin-react           | ^4.3.1  | ^6.0.3   | major                      |
| @xterm/xterm                   | ^5.5.0  | ^6.0.0   | **major**                  |
| @xterm/addon-fit               | ^0.10.0 | ^0.11.0  | minor (pairs with xterm 6) |
| ansi_up                        | ^6.0.2  | ^6.0.6   | patch                      |
| react-router                   | — (new) | ^8.2.0   | new dependency (Phase 5)   |

Re-run `npm view <pkg> version` at execution time; use whatever is latest then.

## Ground rules for the executing agent

1. **One phase per commit (minimum).** Never mix a dependency upgrade with a refactor in the same commit — if something breaks, the bisect must be unambiguous.
2. **Verify after every phase** using the smoke checklist (bottom of this file). The app must start and core flows must work before moving on.
3. **Behavior-preserving.** No feature changes, no UI redesign, no renamed API routes, no changes to `data/*.json` shapes. If you find a bug, fix it in its own commit with a note, or leave a `TODO` — don't silently change semantics.
4. **Never commit `data/`, `envs/`, `backups/`, or `client/dist/`** (already gitignored — keep it that way). These contain personal data and secrets.
5. Match existing code style: plain JS (no TypeScript migration in this plan), functional React components, minimal dependencies. Do not introduce state-management or CSS libraries — the lean-dependency approach is a feature of this project. The one sanctioned addition is **React Router** (Phase 5), for deep-linkable pages.

---

## Phase 0 — Baseline

1. Commit the current working tree as-is (it contains an unfinished nav restructure that must not be lost): `git add -A && git commit`.
2. `npm install`, `npm run dev`, and run the full smoke checklist. Record any pre-existing failures — those are not regressions you need to fix.
3. Note the Node version in use (repo currently claims Node 18+ in README; Vite 8 will raise this — see Phase 2).

## Phase 1 — Tooling & repo hygiene

The cheapest credibility wins for a public repo:

1. **Prettier** (v3): add `.prettierrc` matching the existing style (single quotes, semicolons, 100–120 print width so existing JSX doesn't reflow badly), `.prettierignore` (`client/dist`, `data`, `envs`, `backups`, `node_modules`). Run it once over the repo in a dedicated commit ("format only, no logic changes").
2. **ESLint 9 (flat config)**: root `eslint.config.js` covering both `server/` (node globals, CommonJS for now) and `client/src/` (browser globals, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`). Fix or explicitly disable each warning — an out-of-the-box-red lint is worse than none. Notable existing smells it will catch: empty `catch {}` blocks (keep, but make intentional: `catch { /* polling — ignore */ }`).
3. **Root scripts**: add `lint`, `format`, `format:check` to root `package.json`.
4. **`engines` field** in both `package.json` files once the Node floor is known (Phase 2).
5. **`.editorconfig`** (2-space, LF, UTF-8).
6. **CI**: `.github/workflows/ci.yml` — on push/PR: `npm ci`, lint, `npm --prefix client run build`. (Tests join in Phase 7.)
7. Audit tracked files for anything personal: `git ls-files` — confirm no personal paths, tokens, or company URLs are committed (README examples use placeholders; keep it that way).

## Phase 2 — Dependency upgrades (one commit each, in this order)

Order rationale: server and client are independent; within the client, Vite before React keeps each step testable.

### 2a. Trivial bumps

`ws`, `ansi_up`, `concurrently` (v10 needs Node 20+ — acceptable, see below). Verify: app starts, terminals work, logs render colors.

### 2b. Express 4 → 5

- This codebase uses only simple literal routes (`/`, `/:id`), `express.json()`, and `express.Router()` — none of the removed APIs — so the migration is mostly mechanical. Consult the official migration guide anyway.
- Things to actively check:
  - Route paths: path-to-regexp v8 syntax changes (no bare `*` wildcards, no `?` optional markers). Grep all `router.` calls to confirm only literal/`:param` paths exist.
  - `req.query` is a getter now — read-only usage here, fine.
  - **Win**: Express 5 auto-forwards rejected promises from async handlers to error middleware. Add a terminal error-handling middleware in `server/index.js` (`(err, req, res, next) => res.status(500).json({ error: err.message })`) plus a JSON 404 handler — this also fixes today's failure mode where an async throw hangs the request.
- Verify: every route in the smoke checklist.

### 2c. claude-agent-sdk 0.1 → 0.3

- `server/lib/claude.js` (~50 lines) is the only consumer. The 0.x SDK has had breaking API changes between minors — read the SDK changelog/migration notes and adapt the call sites.
- This dependency is **optional** at runtime; preserve the graceful "SDK not installed" degradation. Verify: content draft generation and digest review either work (if authenticated) or fail with the existing friendly message.

### 2d. Vite 5 → 8 + @vitejs/plugin-react 6

- Node floor becomes **20.19+ / 22.12+**. Set `engines` accordingly in both `package.json` files and update README ("Node 18+" → the new floor).
- `client/vite.config.js` is tiny; expect it to work unchanged (check the dev proxy for `/api` and the `/term` WebSocket proxy still function — proxy `ws: true` behavior must be re-verified).
- Read the Vite 6/7/8 migration pages for anything that applies; this project uses near-default config, so expect little.
- Verify: `npm run dev` (HMR works), `npm --prefix client run build` succeeds.

### 2e. React 18 → 19

- Check `client/src/main.jsx` uses `createRoot` from `react-dom/client` (it should; fix if not).
- This codebase uses no legacy APIs (no propTypes, no defaultProps on functions, no string refs, no `forwardRef`-heavy patterns) — expect a near-drop-in upgrade. Run the official React 19 codemod set if anything surfaces.
- Verify: full client smoke pass; watch the console for new warnings.

### 2f. @xterm/xterm 5 → 6 + addon-fit 0.11

- Consumers: `client/src/pages/Workspace.jsx` (`TermView`) only — `new Terminal(opts)`, `loadAddon`, `open`, `onData`, `write`, `dispose`, and the CSS import `@xterm/xterm/css/xterm.css`. Check the 6.0 changelog for renames in these APIs and the CSS path.
- Verify: open terminals (home + project cwd), type commands, resize the window (fit + server-side resize message `\x00resize:` must keep working), close tab.

## Phase 3 — Server: separation of concerns

Current shape is already routes + lib, but routes mix HTTP handling, validation, and persistence. Target: **routes parse/validate and shape responses; `lib/` owns all fs/process/data access.**

1. **ESM migration** (`"type": "module"` in root `package.json`, `require` → `import`): do this first, in its own commit. It touches every server file mechanically and aligns server with client. `__dirname` in `lib/store.js` becomes `import.meta.dirname` (Node 20.11+).
2. **Extract domain logic from routes into lib modules.** E.g. `routes/projects.js` currently does validation + `read`/`write` mutation inline — move to `lib/projects.js` exposing `list/create/update/remove`, keeping the route file ~30 lines. Apply the same pattern to the other routes that inline logic (`workflows.js` at 142 lines is the main offender; `content.js`, `skills.js`, `patches.js` next). Routes that are already thin wrappers can stay.
3. **Shared helpers**: one `lib/validate.js` for the repeated patterns (required-field checks, path existence + `~` expansion — `expandHome` currently lives in `routes/projects.js` and belongs in a lib).
4. **Consistent error contract**: all errors as `{ error: string }` with correct status codes, thrown from lib as typed errors (e.g. `NotFoundError`) and mapped once in the Phase-2b error middleware — delete per-route boilerplate.
5. `server/index.js` stays the composition root; keep the localhost-only bind and its comment.

## Phase 4 — Client: separation of concerns

Target structure (move + split; no behavior changes):

```
client/src/
  api.js                     # keep as-is (it's fine)
  App.jsx                    # layout + page switching ONLY (~50 lines)
  hooks/
    usePoll.js               # NEW — see below
  lib/
    bus.js                   # existing
    parsers.js               # NEW — shared "name: value" line parsing
  components/
    layout/  Sidebar.jsx, TilBar.jsx
    common/  ConfirmDialog.jsx, SubTabs.jsx
    projects/ ProjectForm.jsx, ProjectCard.jsx, ServiceRow.jsx,
              LinkButton.jsx, LogPanel.jsx, EnvPanel.jsx, PatchPanel.jsx
    workspace/ TermView.jsx, PreviewFrame.jsx
  pages/   (containers only: data loading + composition)
```

Specific extractions:

1. **`usePoll(fn, intervalMs)` hook.** The pattern `let alive; poll(); setInterval; cleanup` is copy-pasted **three times** (`App.jsx` crash badge @5s, `Projects.jsx` statuses @2s, `LogPanel` @1.5s). One hook, three call sites. This is the single highest-value dedup in the client.
2. **`lib/parsers.js`.** `Projects.jsx` contains four near-identical "split lines, split on first `:`" parsers (services, env targets, previews, links). Extract one `parseNamedLines(text, { defaultName })` plus the two thin domain wrappers (`parseServices` handles the `*` auto-restart suffix). Serialize counterparts too (form prefill currently rebuilds these strings inline).
3. **Split `Projects.jsx` (366 lines → ~120-line page + components).** It currently defines `ProjectForm`, `LinkButton`, `LogPanel`, the card markup, and workflow quick-run inline. Extract `ProjectCard` (card + tabs + service rows) and move each named component to `components/projects/`. The workflow quick-run row can become `components/projects/WorkflowQuickRun.jsx`.
4. **Split `Workspace.jsx` (234 lines).** `TermView` and `FrameTab` (rename `PreviewFrame`) move to `components/workspace/`. Known pre-existing wart to preserve-or-fix (own commit if fixed): the `hub:open-preview` effect depends on `[tabs]`, re-subscribing every tabs change — a `useRef`-based handler removes the churn.
5. **Slim `App.jsx`**: extract `TilBar` and the sidebar into `components/layout/`; keep the `KEEP_MOUNTED` workspace-stays-alive mechanism exactly as is (it's intentional — terminals/iframes must survive page switches; add a one-line comment saying so).
6. **`styles.css` (329 lines)**: acceptable for this size — just reorganize into commented sections matching the component tree (layout / cards / forms / terminal / preview / content). Do **not** introduce CSS modules or Tailwind.

## Phase 5 — React Router (URL-driven navigation)

Add **`react-router` v8** (the single package — do NOT install `react-router-dom`, which is the legacy v7-era wrapper). Use plain **library/declarative mode** (`BrowserRouter` + `Routes`); do not adopt framework mode, loaders, or SSR — this is a small SPA and data fetching stays in the pages as-is. v8 is recent: read its release notes/changelog before starting and adapt if APIs moved since this plan was written.

Today navigation is `useState` in three places (`App.jsx` page switching, `ContentHub.jsx` and `Library.jsx` sub-tabs, plus the Projects overview/workflows tab) — none of it survives a browser refresh or can be linked to. Target route map:

```
/                    → redirect to /projects
/projects            → Projects (overview tab)
/projects/workflows  → Projects (workflows tab)
/workspace           → Workspace (see keep-mounted note below)
/content             → redirect to /content/learning
/content/learning    → Learning queue
/content/pipeline    → Ideas & drafts
/content/digest      → Digest
/library             → redirect to /library/snippets
/library/snippets    → Snippets
/library/skills      → AI skills
*                    → redirect to /projects (no 404 page needed for a local tool)
```

Steps:

1. Wrap the app in `BrowserRouter` in `main.jsx`; convert `App.jsx`'s `PAGES` array + `useState` into `<Routes>` inside the existing layout (sidebar + TIL bar stay outside `<Routes>` as a layout shell).
2. Sidebar buttons → `NavLink` (active styling comes free via the `isActive` class callback; keep the existing `.nav-item.active` CSS class).
3. **Critical — keep Workspace alive across navigation.** Terminals and preview iframes must NOT unmount when the user navigates away (this is what the current `KEEP_MOUNTED` hack preserves). Do not put `<Workspace />` inside a `<Route>` — a route change would unmount it and kill every terminal session. Instead, render `<Workspace />` unconditionally in the layout shell, shown/hidden via `useLocation()` (`display: pathname === '/workspace' ? 'block' : 'none'`), and give `/workspace` a route that renders `null`. Preserve the explanatory comment. **Verify by opening a terminal, running `top`, navigating to Projects and back — the terminal must still be live.**
4. Sub-tabs → routes: `ContentHub` and `Library` become layout routes with nested `<Route>`s (or just read the tab from the path); `SubTabs` gets a variant that navigates (`useNavigate` or render `NavLink`s) instead of calling `setState`. Same for the Projects overview/workflows page tab. Delete the now-dead `useState` tab plumbing.
5. Replace the `hub:open-preview` → `setPage('workspace')` wiring in `App.jsx` with `useNavigate()` to `/workspace`. Keep `lib/bus.js` itself — it also carries the pending-preview payload that Workspace consumes on the other side; only the page-switching half moves to the router.
6. The per-project card tab state (`cardTab` in Projects — services/env/patches per card) stays as component state; it's per-card UI state, not navigation. Don't force it into the URL.
7. No server changes needed: Vite's dev server serves `index.html` for unknown paths by default (SPA fallback), and the Express server doesn't serve the built client. Verify a hard refresh on `http://localhost:5173/content/digest` loads correctly.

Verify: full smoke pass + browser back/forward moves between pages, refresh on every deep link works, sidebar active state follows the URL.

## Phase 6 — Public-readiness polish

1. README: update Node requirement, refresh the file-tree/architecture description to match the new structure (add a short "Architecture" section: `server/routes → server/lib → data/*.json`; `client pages → components → api.js`), verify setup instructions on a clean clone (`git clone` → `npm install` → `npm run dev`).
2. Add `CONTRIBUTING.md` (short: setup, lint/format commands, PR expectations) — optional but cheap.
3. `npm audit` — resolve or document anything high/critical.
4. Kill dead code: grep for unused exports/components left over from the pre-refactor nav (the git status shows `Dashboard/EnvPage/Patches/Preview/Terminals` pages were deleted — confirm nothing still imports them and no orphaned CSS selectors/routes remain).

## Phase 7 — Minimal test safety net (recommended, last)

Keep it proportionate — this is a personal tool, not a library:

1. **Server**: `vitest` + `supertest` against the Express app (export `app` separately from `server.listen` so tests don't bind a port). Cover: projects CRUD happy path + validation errors, snippets CRUD, store read/write round-trip with a temp `DATA_DIR`. ~10 tests.
2. **Client**: `vitest` unit tests for `lib/parsers.js` (the only real logic) — services with `*`, missing `:`, empty lines.
3. Wire into CI.

---

## Smoke checklist (run after every phase)

`npm run dev`, open http://localhost:5173, then:

- [ ] Projects page loads; add → edit → remove a throwaway project (real path, e.g. `~`)
- [ ] Start a service (e.g. `web: sleep 60`), green dot appears, Logs panel streams, Stop works
- [ ] Crash detection: service `boom: false` shows red dot + crashed chip + sidebar badge
- [ ] Env presets tab: save preset from an `.env`, swap it, file changes, backup lands in `backups/`
- [ ] Patches tab: apply + revert a text-replace patch; status detection correct
- [ ] Workflows: create one, run it from Projects quick-run, per-step results reported
- [ ] Workspace: open terminal (home + a project), run a command, resize window, close tab
- [ ] Workspace: open preview of a running localhost URL; iframe-blocked site shows the ↗ fallback
- [ ] TIL bar logs an entry; Content page shows it; Learning queue drag/status changes persist
- [ ] Digest renders counts; Claude features either work or degrade with the friendly message
- [ ] Snippets: add, search, copy; Skills: repo scan works (point at any folder with a `SKILL.md`)
- [ ] (After Phase 5) Deep links: hard-refresh on `/content/digest` and `/library/skills` works; back/forward navigates pages; open a terminal, navigate away and back — terminal session still alive
- [ ] `npm --prefix client run build` succeeds; no new console errors/warnings in the browser
