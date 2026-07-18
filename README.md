# ⚡ Dev Hub

Your personal local mission control: start/stop project services, swap env presets, run terminals (and Claude Code) in the browser, save snippets, and track what to learn next.

Everything runs on **localhost only** and stores data as JSON files inside this folder. Nothing leaves your machine.

## Why this exists

I got tired of re-running the same setup rituals every morning — start three services, swap the right `.env`, comment out that one auth line, open the right tabs. So I built the tool I wanted, then kept adding the rest of my workflow: what I'm learning, what I'll turn into content, snippets I keep googling.

It's free and MIT-licensed. Clone it, gut it for parts, make it yours.

## Setup

Requires Node 18+.

```bash
cd dev-hub
npm install        # installs server + client deps (client via postinstall)
npm run dev        # starts server (:5001) + client (:5173)
```

Open **http://localhost:5173**.

> **Terminals:** they need `node-pty`, which compiles natively. On macOS you need Xcode Command Line Tools (`xcode-select --install`). If it fails to install, everything else still works — the Terminals page will tell you.

> **Claude-powered features** (content drafts, digest reviews) need `@anthropic-ai/claude-agent-sdk` (installed automatically with `npm install`). It authenticates via your existing Claude Code login or `ANTHROPIC_API_KEY`. If it's missing, those features tell you and everything else still works. For chatting with Claude Code, use a terminal (embedded or your own) or the Claude desktop app.

## Using it

The sidebar has four pages, grouped by what you're doing — managing projects, working in them, producing content, or reaching for reference material.

### Projects

**Projects** — add each project: name, absolute path, and services one per line (`web: yarn dev`). Then start/stop with one click and watch live logs. Green dot = running. Each project card has three tabs — **Services**, **Env presets**, **Patches** — so a whole setup ritual happens in one place.

**Env presets** — replaces your Fork stash workflow. Save a project's current `.env` as a preset (e.g. `dev`), change it, save again as `staging`. From then on: one click to swap, right on the project card. Files are changed in place — nothing extra appears in your project; the previous version is saved inside `dev-hub/backups/`.

**Patches** — named file tweaks you apply/revert on demand. Two op types: _Env value_ (change one key, e.g. `IAM_API_URL`, leaving the rest of the file alone — revert restores the previous value) and _Text replace_ (e.g. comment a line out, revert swaps it back). Status detection shows whether each patch is currently applied. Idempotent — applying twice changes nothing.

**Workflows** — your setup rituals as one click. A workflow is an ordered list of steps: start/stop services, apply env presets, apply/revert patches, open previews. Edit them under Projects → Workflows; run them from the quick-run buttons at the top of the Projects page. Failed steps are reported individually; the rest still run.

**Crash awareness** — a service that exits non-zero shows a red dot + "crashed (code)" chip, and a red badge appears on Projects in the sidebar from any page. Mark a service with `*` in its name (`api*: yarn start`) to auto-restart it up to 3 times after a crash. Stopping a crashed service acknowledges it.

**Links** — per-project shortcuts (repo, MRs, pipelines, docs) shown on the project card. Each link is checked for embeddability: sites that allow framing open inside the hub's Workspace; sites that block it (github.com, gitlab.com, most self-hosted GitLab) open in a new browser tab via ↗.

### Workspace

One surface for shells and running apps, with a mixed tab strip — terminal tabs and preview tabs side by side. All tabs survive switching pages.

**Terminals** — real shells opened in your home folder or any project. Run `claude` in one to use Claude Code inside the hub.

**Previews** — run your apps inside the hub. Set preview URLs per service (Projects → Edit, e.g. `web: localhost:4000`), then hit Preview on a running service or open any URL from the Workspace toolbar. HMR keeps working, and your browser DevTools inspect the embedded app normally — pick its frame in the Console's context dropdown. Apps that send `X-Frame-Options`/`frame-ancestors` are detected and flagged with an "open in new tab" fallback.

### Content

The learn → post pipeline as three sub-tabs: **Learning queue**, **Ideas & drafts**, **Digest**.

**TIL bar** — the input at the top of every page. Log what you learn in 3 seconds; it feeds the drafts and the digest.

**Learning queue** — queued → learning → done board so nothing you want to learn gets lost. Done items are your future content ideas.

**Ideas & drafts** — select TILs (or just type a title), create an idea, and Claude generates a TikTok script, X thread, and LinkedIn post. Edit drafts inline, copy per platform, move ideas idea → drafted → posted.

**Digest** — your last 7/14/30 days at a glance (TILs, learning finished, content shipped) plus a Claude-written weekly review with content ideas for next week.

### Library

**Snippets** — the commands you keep googling. Search + one-click copy.

**AI skills** — point it at your skills repo (subfolders with `SKILL.md`, or loose `.md` files); select skills and install them into any project's `.claude/skills` with one click.

## Where data lives

| What                               | Where                         |
| ---------------------------------- | ----------------------------- |
| Projects, snippets, learning items | `data/*.json`                 |
| Env presets                        | `envs/<projectId>/<name>.env` |

Both are gitignored (env presets contain secrets — keep them out of any remote).

## Roadmap (build next)

1. **Git dashboard** — branch/stash/dirty state across all repos at a glance.
2. **Money tracker** — income streams and goals with a scoreboard.
3. **Learning → TIL flow** — mark a learning item done and turn it into a TIL in one step.

## License

[MIT](LICENSE) — do whatever you want with it. If it saves you time, that's the point.
