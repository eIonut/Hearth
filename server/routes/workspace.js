import express from 'express';
import { read, write } from '../lib/store.js';
import { ValidationError } from '../lib/errors.js';

const router = express.Router();
const NAME = 'workspace';

// Which tabs were open, where they pointed, how they were arranged, and which
// was in front — so the workspace comes back the way you left it instead of
// empty. The shells themselves live in lib/terminals.js; a tab only holds the
// sessionId that addresses one.
//
// Shape: {
//   tabs: [{ id, kind, label, cwd?, sessionId?, url? }],
//   layout: { mode, ratio, panes: [{ tabIds, activeTab }, { tabIds, activeTab }] },
//   updatedAt
// }
//
// The split is deliberately one level, two panes — enough for the case that
// matters (a terminal beside the preview it's serving) without a recursive tree
// to persist, validate, and reason about.

const MAX_TABS = 50;
const KINDS = new Set(['term', 'preview']);
const MODES = new Set(['single', 'vsplit', 'hsplit']);
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

function str(v, max = 2000) {
  return typeof v === 'string' ? v.slice(0, max) : undefined;
}

// Only known fields survive a round trip, so a malformed or hand-edited file
// can't inject anything the client will later act on.
function cleanTab(raw, index) {
  if (!raw || typeof raw !== 'object') throw new ValidationError(`tab ${index} is not an object`);
  if (!KINDS.has(raw.kind)) throw new ValidationError(`tab ${index} has an unknown kind`);
  if (!Number.isFinite(raw.id)) throw new ValidationError(`tab ${index} is missing a numeric id`);

  const tab = { id: raw.id, kind: raw.kind, label: str(raw.label, 200) || '' };
  if (raw.kind === 'term') {
    tab.cwd = str(raw.cwd) || '';
    tab.sessionId = str(raw.sessionId, 100) || '';
  } else {
    tab.url = str(raw.url) || '';
  }
  return tab;
}

// Every tab must end up in exactly one pane. Anything unassigned, duplicated
// across panes, or pointing at a tab that no longer exists is repaired here
// rather than trusted — losing a tab to a bad layout would lose the shell with it.
function cleanLayout(rawLayout, tabs, legacyActiveTab) {
  const raw = rawLayout && typeof rawLayout === 'object' ? rawLayout : {};
  const mode = MODES.has(raw.mode) ? raw.mode : 'single';
  const ratio =
    Number.isFinite(raw.ratio) && raw.ratio >= MIN_RATIO && raw.ratio <= MAX_RATIO
      ? raw.ratio
      : 0.5;

  const valid = new Set(tabs.map((t) => t.id));
  const claimed = new Set();
  const rawPanes = Array.isArray(raw.panes) ? raw.panes : [];

  const panes = [0, 1].map((i) => {
    const pane = rawPanes[i] && typeof rawPanes[i] === 'object' ? rawPanes[i] : {};
    const ids = Array.isArray(pane.tabIds) ? pane.tabIds : [];
    const tabIds = [];
    for (const id of ids) {
      if (!valid.has(id) || claimed.has(id)) continue;
      claimed.add(id);
      tabIds.push(id);
    }
    return { tabIds, activeTab: Number.isFinite(pane.activeTab) ? pane.activeTab : null };
  });

  // Tabs no pane claimed (first save, a dropped id, a merge that raced) land in
  // the first pane so they stay reachable.
  for (const tab of tabs) {
    if (!claimed.has(tab.id)) panes[0].tabIds.push(tab.id);
  }

  // Collapsing an empty second pane keeps the UI honest: mode never says split
  // while there is nothing to show on one side.
  const effectiveMode = panes[1].tabIds.length === 0 ? 'single' : mode;
  if (effectiveMode === 'single' && panes[1].tabIds.length) {
    panes[0].tabIds.push(...panes[1].tabIds);
    panes[1].tabIds = [];
  }

  for (const pane of panes) {
    if (!pane.tabIds.includes(pane.activeTab)) {
      pane.activeTab = pane.tabIds.length ? pane.tabIds[pane.tabIds.length - 1] : null;
    }
  }
  // Migration from the pre-split format, which had a single top-level activeTab.
  if (Number.isFinite(legacyActiveTab) && panes[0].tabIds.includes(legacyActiveTab)) {
    panes[0].activeTab = legacyActiveTab;
  }

  return { mode: effectiveMode, ratio, panes };
}

router.get('/', (req, res) => {
  const state = read(NAME, {});
  const tabs = Array.isArray(state.tabs) ? state.tabs : [];
  res.json({ tabs, layout: cleanLayout(state.layout, tabs, state.activeTab) });
});

router.put('/', (req, res) => {
  const { tabs, layout } = req.body;
  if (!Array.isArray(tabs)) throw new ValidationError('tabs must be an array');
  if (tabs.length > MAX_TABS) throw new ValidationError(`too many tabs (max ${MAX_TABS})`);

  const clean = tabs.map(cleanTab);
  const state = {
    tabs: clean,
    layout: cleanLayout(layout, clean, req.body.activeTab),
    updatedAt: Date.now(),
  };
  write(NAME, state);
  res.json(state);
});

export default router;
