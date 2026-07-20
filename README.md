# ⚡ Dev Hub

Your personal local mission control: start/stop project services, swap env presets, run terminals in the browser, save snippets, and track what to learn next.

Everything runs on **localhost only** and stores data as JSON files inside this folder. Nothing leaves your machine.

## Why this exists

I got tired of re-running the same setup rituals every morning — start three services, swap the right `.env`, comment out that one auth line, open the right tabs. So I built the tool I wanted, then kept adding the rest of my workflow: what I'm learning and snippets I keep googling.

It's free and MIT-licensed. Clone it, gut it for parts, make it yours.

## Setup

Requires Node 20.19+ or 22.12+ (Vite 8 floor).

```bash
cd dev-hub
npm install        # installs server + client deps (client via postinstall)
npm run dev        # starts server (:5001) + client (:5173)
```

Open **http://localhost:5173**.

> **Terminals:** they need `node-pty`, which compiles natively. On macOS you need Xcode Command Line Tools (`xcode-select --install`). If it fails to install, everything else still works — the Workspace will tell you.

## Using it

The sidebar has four pages, grouped by what you're doing — managing projects, working in them, learning, or reaching for reference material.

### Projects

**Projects** — add each project: name, absolute path, and services one per line (`web: yarn dev`). Then start/stop with one click and watch live logs. Green dot = running. Each project card also shows its Git branch, commits to push or pull, and changed files. Non-Git folders work normally too. The card has three tabs — **Services**, **Env presets**, **Patches** — so a whole setup ritual happens in one place.

Services that were running when the hub went down are started again on the next
boot, and their logs are marked `restored after hub restart`. Anything whose
project, service definition, or folder has since disappeared is skipped with a
reason on the console instead of failing the boot. To boot without starting
anything, set `"autoRestartServices": false` in `data/settings.json`.

**Env presets** — replaces your Fork stash workflow. Save a project's current `.env` as a preset (e.g. `dev`), change it, save again as `staging`. From then on: one click to swap, right on the project card. Files are changed in place — nothing extra appears in your project; the previous version is saved inside `dev-hub/backups/`.

**Patches** — named file tweaks you apply/revert on demand. Two op types: _Env value_ (change one key, e.g. `IAM_API_URL`, leaving the rest of the file alone — revert restores the previous value) and _Text replace_ (e.g. comment a line out, revert swaps it back). Status detection shows whether each patch is currently applied. Idempotent — applying twice changes nothing.

**Workflows** — your setup rituals as one click. A workflow is an ordered list of steps: start/stop services, apply env presets, apply/revert patches, run any command in a project or home-folder terminal, and open any URL in the Workspace or a browser tab. Edit them under Projects → Workflows; run them from the quick-run buttons at the top of the Projects page. Failed steps are reported individually; the rest still run.

**Templates** — spin up a _new_ project in one click. A template is a named command sequence (e.g. `npm create vite@latest my-app`, `cd my-app`, `npm install`, `npm run dev`) with an optional folder to run in. Edit them under Projects → Templates; scaffold from there or from the quick-run buttons at the top of the Projects page. Clicking **Scaffold** opens a Workspace terminal in that folder and runs the commands chained together — so interactive scaffolders (framework pickers) work, and the final `npm run dev` stays live in that tab. Nothing is auto-added as a project; add it with **+ Add project** when you're ready.

**Crash awareness** — a service that exits non-zero shows a red dot + "crashed (code)" chip, and a red badge appears on Projects in the sidebar from any page. Mark a service with `*` in its name (`api*: yarn start`) to auto-restart it up to 3 times after a crash. Stopping a crashed service acknowledges it.

**Links** — per-project shortcuts (repo, MRs, pipelines, docs) shown on the project card. Each link is checked for embeddability: sites that allow framing open inside the hub's Workspace; sites that block it (github.com, gitlab.com, most self-hosted GitLab) open in a new browser tab via ↗.

### Workspace

One surface for shells and running apps, with a mixed tab strip — terminal tabs and preview tabs side by side. All tabs survive switching pages.

**Terminals** — real shells opened in your home folder or any project. Shells live on the server, not in the browser tab: refreshing the page, closing the hub, or navigating away **detaches** and reattaches you to the same shell, with its scrollback and whatever you left running. Closing a tab with ✕ is the one gesture that kills a shell. The **Sessions** button lists every shell the server is holding — including any no tab points at anymore, which you can reattach or kill. Shells sitting idle at a prompt are cleaned up after a day; anything still running a command is left alone.

**Splitting** — **Split** puts two panes side by side (or stacked), each with its own tabs, so a terminal sits next to the preview it is serving. Drag the divider to resize, and use ⇄ on a tab to send it to the other pane.

**What is remembered** — which tabs were open, their working directories, the split layout, and which tab was in front all come back on restart, saved in `data/workspace.json`. If a shell is gone (the hub restarted), its tab reopens in the same folder and says so rather than passing a fresh shell off as the old one.

**Previews** — run your apps inside the hub. Set preview URLs per service (Projects → Edit, e.g. `web: localhost:4000`), then hit Preview on a running service or open any URL from the Workspace toolbar. HMR keeps working, and your browser DevTools inspect the embedded app normally — pick its frame in the Console's context dropdown. Apps that send `X-Frame-Options`/`frame-ancestors` are detected and flagged with an "open in new tab" fallback.

### Learning

**Learning queue** — queued → learning → done board so nothing you want to learn gets lost, with finished items retained as a record of your progress.

### Library

**Snippets** — the commands you keep googling. Search + one-click copy.

**AI skills** — point it at your skills repo (subfolders with `SKILL.md`, or loose `.md` files); select skills and install them into any project's `.claude/skills` with one click.

**Backup** — your data (snippets, notes, learnings, workflows, templates) is gitignored, so it never ships with the app repo — which also means a lost laptop or fresh clone loses it. This tab points that data at a backup destination **you** own. Pick which collections to include (env presets, patches, backups and local settings are never included — patch ops embed literal env values); a **secret scan** flags anything that looks like a key or token before it leaves your machine. Two destinations, same data:

- **Cloud folder** — write into a folder your OS already syncs (iCloud, Dropbox, OneDrive, Drive). Zero setup, off-machine within seconds. It's a mirror, not version history. Detected providers show up as one-click buttons.
- **Git remote** — push to a **private** repo you own (not a fork of this one). Full history and diffs; needs your SSH key or credential helper already set up. The sync repo lives **outside** the app tree (`~/.dev-hub/sync` by default), a fully independent git repo — so `git pull`-ing app updates never conflicts with your data, and git operations can never touch the app repo.

**Restore** on a new machine pulls it back; your current local data is snapshotted to `backups/` first, so a mistaken restore is always recoverable.

## Architecture

Two independent halves, connected only over HTTP/WebSocket on localhost:

**Server** (`server/`, Express 5, ESM) — a thin HTTP layer over the filesystem:

```
server/routes/*   parse & validate requests, shape JSON responses (thin)
      ↓
server/lib/*      all fs / process / data access (projects, envops, patchops,
                  procman, terminals, workflows, store, backup)
      ↓
data/*.json       persisted state       envs/  env presets
```

Routes stay thin; `lib/` owns every side effect. Errors are thrown as typed
errors from `lib/` and mapped once to `{ error }` responses by the terminal
error middleware in `server/index.js`. The server binds to localhost only.

**Client** (`client/`, React 19 + Vite 8, React Router v8) — a small SPA:

```
client/src/pages/*        containers: data loading + composition
      ↓
client/src/components/*    layout/ · common/ · projects/ · workspace/
      ↓
client/src/api.js          single fetch wrapper to the server
```

Navigation is URL-driven (deep-linkable, refresh-safe). The Workspace stays
mounted across route changes so terminals and preview iframes survive
navigation. Shared logic lives in `hooks/` (`usePoll`) and `lib/`
(`parsers`, `bus`).

Styling is **Tailwind CSS v4** (CSS-first, no `tailwind.config.js`). Design
tokens live in `client/src/index.css` under `@theme`; shared primitives
(`.btn`, `.chip`, `.dot`, `.card`, `.nav-item`, sub-tabs, workspace tabs) are
defined with `@apply` in `@layer components`; everything else is inline
utilities in the JSX. There is no separate stylesheet.

## Where data lives

| What                               | Where                            |
| ---------------------------------- | -------------------------------- |
| Projects, snippets, learning items | `data/*.json`                    |
| Open tabs and split layout         | `data/workspace.json` (local)    |
| Services running at last shutdown  | `data/servicestate.json` (local) |
| Env presets                        | `envs/<projectId>/<name>.env`    |
| Git sync repo (Backup tab)         | `~/.dev-hub/sync` → your remote  |

All are gitignored (env presets contain secrets — keep them out of any remote).
Use the **Library → Backup** tab to sync the portable `data/` collections to a
cloud folder or a private git remote you own.

Entries marked _(local)_ are machine-local runtime state and are never synced or
restored, even if a backup bundle contains them: `workspace.json` holds absolute
paths and terminal session ids that mean nothing elsewhere, and restoring another
machine's `servicestate.json` would auto-start its services on your next boot.
`settings.json` stays local too — it holds the sync configuration itself.

## License

[MIT](LICENSE) — do whatever you want with it. If it saves you time, that's the point.
