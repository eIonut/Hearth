# Contributing

Thanks for taking a look. This is a personal tool released for others to fork and
learn from — contributions are welcome but kept simple.

## Setup

Requires Node 20.19+ or 22.12+.

```bash
git clone <your-fork>
cd dev-hub
npm install        # installs server + client deps (client via postinstall)
npm run dev        # server on :5001, client on :5173
```

Open http://localhost:5173.

## Before you open a PR

```bash
npm run lint          # ESLint over server + client
npm test              # vitest: server API/store + client parsers
npm run format        # Prettier — write
npm run format:check  # Prettier — verify
npm --prefix client run build   # client build must succeed
```

CI runs lint + tests + client build on every push and PR; keep them green.
Tests live in `server/test/` (supertest against the exported app, with a temp
`DEV_HUB_DATA_DIR`) and next to the code they cover on the client
(`client/src/lib/parsers.test.js`).

## Guidelines

- **Keep it lean.** Minimal dependencies is a feature here — no state-management
  library. Styling is Tailwind CSS v4 (the one sanctioned CSS dependency); don't
  add other CSS frameworks. Plain JS (no TypeScript), functional React components.
- **Don't change on-disk data formats** (`data/*.json`, `envs/`, patch
  definitions) without a very good reason — people have real data in them.
- **Match the surrounding style.** Prettier settles formatting; match the
  existing naming and structure for everything else.
- **One logical change per commit**, with a clear message.
- **Never commit** `data/`, `envs/`, `backups/`, or `client/dist/` — they hold
  personal data and secrets and are gitignored. Keep it that way.

## Reporting issues

Open a GitHub issue with what you expected, what happened, and steps to
reproduce. Since everything runs locally, your Node version and OS help.
