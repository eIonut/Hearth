// Pane arrangement for the workspace, kept as pure immutable helpers so the
// bookkeeping (which pane owns a tab, what stays focused when one closes) is
// testable without a DOM.
//
// One level, two panes — enough for the case that matters, a terminal beside
// the preview it is serving, without a recursive tree to persist and repair.
// Pane 1 exists in the shape even when collapsed, so `mode` is the only thing
// that decides whether the split is showing.

export const MIN_RATIO = 0.15;
export const MAX_RATIO = 0.85;

export function emptyLayout() {
  return {
    mode: 'single',
    ratio: 0.5,
    panes: [
      { tabIds: [], activeTab: null },
      { tabIds: [], activeTab: null },
    ],
  };
}

export function isSplit(layout) {
  return layout.mode !== 'single';
}

export function paneOf(layout, tabId) {
  return layout.panes.findIndex((p) => p.tabIds.includes(tabId));
}

function withPanes(layout, panes) {
  return { ...layout, panes };
}

function mapPane(layout, index, fn) {
  return withPanes(
    layout,
    layout.panes.map((pane, i) => (i === index ? fn(pane) : pane)),
  );
}

// Focus falls to the neighbour on the right, then the left — the tab that
// visually takes the closed one's place, rather than jumping to the far end.
function refocus(pane, closedId) {
  if (pane.activeTab !== closedId) return pane;
  const at = pane.tabIds.indexOf(closedId);
  const remaining = pane.tabIds.filter((id) => id !== closedId);
  const next = remaining[at] ?? remaining[at - 1] ?? null;
  return { ...pane, activeTab: next };
}

export function addTab(layout, tabId, paneIndex = 0) {
  const target = isSplit(layout) ? paneIndex : 0;
  return mapPane(layout, target, (pane) => ({
    ...pane,
    tabIds: [...pane.tabIds, tabId],
    activeTab: tabId,
  }));
}

export function removeTab(layout, tabId) {
  const panes = layout.panes.map((pane) =>
    pane.tabIds.includes(tabId)
      ? { ...refocus(pane, tabId), tabIds: pane.tabIds.filter((id) => id !== tabId) }
      : pane,
  );
  // A split with nothing left on one side is just a single pane with dead space.
  const mode = panes[1].tabIds.length === 0 ? 'single' : layout.mode;
  if (mode === 'single' && panes[1].tabIds.length === 0) {
    panes[1] = { tabIds: [], activeTab: null };
  }
  return { ...layout, mode, panes };
}

export function focusTab(layout, tabId) {
  const index = paneOf(layout, tabId);
  if (index === -1) return layout;
  return mapPane(layout, index, (pane) => ({ ...pane, activeTab: tabId }));
}

// Splitting sends the focused tab across, so the second pane opens with
// something in it instead of an empty box the user then has to fill.
export function split(layout, mode, fromPane = 0) {
  if (isSplit(layout)) return { ...layout, mode };
  const source = layout.panes[0];
  const moving = layout.panes[fromPane]?.activeTab ?? source.activeTab;
  if (moving == null || source.tabIds.length < 2) {
    // Nothing to send across: a split here would strand an empty pane.
    return layout;
  }
  const remaining = source.tabIds.filter((id) => id !== moving);
  return {
    ...layout,
    mode,
    panes: [
      {
        tabIds: remaining,
        activeTab: remaining.includes(source.activeTab)
          ? source.activeTab
          : (remaining[remaining.length - 1] ?? null),
      },
      { tabIds: [moving], activeTab: moving },
    ],
  };
}

export function unsplit(layout) {
  const [a, b] = layout.panes;
  return {
    ...layout,
    mode: 'single',
    panes: [
      {
        tabIds: [...a.tabIds, ...b.tabIds],
        activeTab: a.activeTab ?? b.activeTab,
      },
      { tabIds: [], activeTab: null },
    ],
  };
}

// Send a tab to the other side. Splits on demand when there is a second tab to
// leave behind, so "move this over there" works without splitting first.
export function moveTab(layout, tabId) {
  const from = paneOf(layout, tabId);
  if (from === -1) return layout;
  if (!isSplit(layout)) {
    return layout.panes[0].tabIds.length < 2 ? layout : split(layout, 'vsplit', 0);
  }
  const to = from === 0 ? 1 : 0;
  const next = removeTab({ ...layout, mode: layout.mode }, tabId);
  // removeTab may have collapsed the split when the source pane emptied out.
  const panes = next.panes.map((pane, i) =>
    i === to ? { ...pane, tabIds: [...pane.tabIds, tabId], activeTab: tabId } : pane,
  );
  const mode = panes[1].tabIds.length === 0 ? 'single' : layout.mode;
  return { ...layout, mode, panes };
}

export function setRatio(layout, ratio) {
  return { ...layout, ratio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)) };
}

// Build a layout for tabs restored from disk, tolerating a missing or stale
// saved layout: every tab must end up somewhere reachable.
export function hydrateLayout(saved, tabs) {
  const base = emptyLayout();
  const valid = new Set(tabs.map((t) => t.id));
  if (!saved || !Array.isArray(saved.panes)) {
    base.panes[0].tabIds = tabs.map((t) => t.id);
    base.panes[0].activeTab = base.panes[0].tabIds.at(-1) ?? null;
    return base;
  }

  const claimed = new Set();
  const panes = [0, 1].map((i) => {
    const pane = saved.panes[i] || {};
    const tabIds = (pane.tabIds || []).filter((id) => {
      if (!valid.has(id) || claimed.has(id)) return false;
      claimed.add(id);
      return true;
    });
    return { tabIds, activeTab: pane.activeTab ?? null };
  });
  for (const tab of tabs) {
    if (!claimed.has(tab.id)) panes[0].tabIds.push(tab.id);
  }

  let mode = ['single', 'vsplit', 'hsplit'].includes(saved.mode) ? saved.mode : 'single';
  if (panes[1].tabIds.length === 0) {
    mode = 'single';
  } else if (mode === 'single') {
    panes[0].tabIds.push(...panes[1].tabIds);
    panes[1] = { tabIds: [], activeTab: null };
  }
  for (const pane of panes) {
    if (!pane.tabIds.includes(pane.activeTab)) pane.activeTab = pane.tabIds.at(-1) ?? null;
  }

  const ratio = Number.isFinite(saved.ratio) ? saved.ratio : 0.5;
  return { mode, ratio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)), panes };
}
