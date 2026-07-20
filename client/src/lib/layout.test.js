import { describe, it, expect } from 'vitest';
import {
  emptyLayout,
  addTab,
  removeTab,
  focusTab,
  split,
  unsplit,
  moveTab,
  setRatio,
  paneOf,
  isSplit,
  hydrateLayout,
} from './layout.js';

// Build a single-pane layout holding tabs 1..n, with the last one focused.
function withTabs(n) {
  let layout = emptyLayout();
  for (let i = 1; i <= n; i++) layout = addTab(layout, i);
  return layout;
}

describe('addTab / focusTab', () => {
  it('adds to the first pane and focuses the new tab', () => {
    const layout = withTabs(2);
    expect(layout.panes[0].tabIds).toEqual([1, 2]);
    expect(layout.panes[0].activeTab).toBe(2);
    expect(isSplit(layout)).toBe(false);
  });

  it('adds into the focused pane once split', () => {
    const layout = addTab(split(withTabs(2), 'vsplit'), 3, 1);
    expect(layout.panes[1].tabIds).toEqual([2, 3]);
    expect(layout.panes[1].activeTab).toBe(3);
  });

  it('ignores a focus request for a tab that is not open', () => {
    const layout = withTabs(2);
    expect(focusTab(layout, 99)).toBe(layout);
  });

  it('reports which pane holds a tab', () => {
    const layout = split(withTabs(2), 'vsplit');
    expect(paneOf(layout, 1)).toBe(0);
    expect(paneOf(layout, 2)).toBe(1);
    expect(paneOf(layout, 99)).toBe(-1);
  });

  it('focuses a tab in the second pane without disturbing the first', () => {
    const layout = focusTab(addTab(split(withTabs(3), 'vsplit'), 4, 1), 3);
    expect(layout.panes[1].activeTab).toBe(3);
    expect(layout.panes[0].activeTab).toBe(2);
  });
});

describe('removeTab', () => {
  it('focuses the tab to the right of the one closed', () => {
    let layout = focusTab(withTabs(3), 2);
    layout = removeTab(layout, 2);
    expect(layout.panes[0].tabIds).toEqual([1, 3]);
    expect(layout.panes[0].activeTab).toBe(3);
  });

  it('falls back to the left when the last tab is closed', () => {
    const layout = removeTab(withTabs(3), 3);
    expect(layout.panes[0].activeTab).toBe(2);
  });

  it('leaves focus alone when another tab is closed', () => {
    let layout = focusTab(withTabs(3), 1);
    layout = removeTab(layout, 3);
    expect(layout.panes[0].activeTab).toBe(1);
  });

  it('nulls focus when the pane empties', () => {
    const layout = removeTab(withTabs(1), 1);
    expect(layout.panes[0].tabIds).toEqual([]);
    expect(layout.panes[0].activeTab).toBeNull();
  });

  it('collapses the split when the second pane empties', () => {
    const layout = removeTab(split(withTabs(2), 'vsplit'), 2);
    expect(layout.mode).toBe('single');
    expect(layout.panes[0].tabIds).toEqual([1]);
  });

  it('keeps the split when the first pane empties but the second still has tabs', () => {
    const layout = removeTab(split(withTabs(2), 'vsplit'), 1);
    expect(layout.mode).toBe('vsplit');
    expect(layout.panes[1].tabIds).toEqual([2]);
  });
});

describe('split / unsplit', () => {
  it('sends the focused tab to the new pane', () => {
    const layout = split(withTabs(2), 'vsplit');
    expect(layout.mode).toBe('vsplit');
    expect(layout.panes[0].tabIds).toEqual([1]);
    expect(layout.panes[1].tabIds).toEqual([2]);
    expect(layout.panes[1].activeTab).toBe(2);
  });

  it('refuses to split a single tab, which would strand an empty pane', () => {
    const layout = withTabs(1);
    expect(split(layout, 'vsplit')).toBe(layout);
  });

  it('refuses to split an empty workspace', () => {
    const layout = emptyLayout();
    expect(split(layout, 'vsplit')).toBe(layout);
  });

  it('switches orientation without reshuffling tabs when already split', () => {
    const v = split(withTabs(2), 'vsplit');
    const h = split(v, 'hsplit');
    expect(h.mode).toBe('hsplit');
    expect(h.panes[0].tabIds).toEqual([1]);
    expect(h.panes[1].tabIds).toEqual([2]);
  });

  it('merges everything back into the first pane', () => {
    const layout = unsplit(split(withTabs(3), 'vsplit'));
    expect(layout.mode).toBe('single');
    expect(layout.panes[0].tabIds).toEqual([1, 2, 3]);
    expect(layout.panes[1].tabIds).toEqual([]);
  });

  it('keeps every tab across a split/unsplit round trip', () => {
    const before = withTabs(4);
    const after = unsplit(split(before, 'vsplit'));
    expect([...after.panes[0].tabIds].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('moveTab', () => {
  it('splits on demand when moving with nothing split yet', () => {
    const layout = moveTab(withTabs(2), 2);
    expect(layout.mode).toBe('vsplit');
    expect(layout.panes[1].tabIds).toEqual([2]);
  });

  it('moves a tab to the other pane and focuses it there', () => {
    let layout = split(withTabs(3), 'vsplit'); // panes: [1,2] | [3]
    layout = moveTab(layout, 1);
    expect(layout.panes[0].tabIds).toEqual([2]);
    expect(layout.panes[1].tabIds).toEqual([3, 1]);
    expect(layout.panes[1].activeTab).toBe(1);
  });

  it('moves a tab back, collapsing the split when the source empties', () => {
    let layout = split(withTabs(2), 'vsplit'); // [1] | [2]
    layout = moveTab(layout, 2);
    expect(layout.mode).toBe('single');
    expect(layout.panes[0].tabIds).toEqual([1, 2]);
  });

  it('does nothing for a tab that is not open', () => {
    const layout = split(withTabs(2), 'vsplit');
    expect(moveTab(layout, 99)).toBe(layout);
  });

  it('never loses or duplicates a tab', () => {
    let layout = withTabs(4);
    for (const id of [4, 1, 3, 2, 4]) layout = moveTab(layout, id);
    const all = [...layout.panes[0].tabIds, ...layout.panes[1].tabIds];
    expect([...all].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('setRatio', () => {
  it('keeps a normal ratio and clamps extremes', () => {
    expect(setRatio(emptyLayout(), 0.3).ratio).toBe(0.3);
    expect(setRatio(emptyLayout(), 0.99).ratio).toBe(0.85);
    expect(setRatio(emptyLayout(), 0).ratio).toBe(0.15);
  });
});

describe('hydrateLayout', () => {
  const tabs = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('puts every tab in one pane when there is no saved layout', () => {
    const layout = hydrateLayout(null, tabs);
    expect(layout.mode).toBe('single');
    expect(layout.panes[0].tabIds).toEqual([1, 2, 3]);
  });

  it('restores a saved split', () => {
    const layout = hydrateLayout(
      {
        mode: 'hsplit',
        ratio: 0.4,
        panes: [
          { tabIds: [1], activeTab: 1 },
          { tabIds: [2, 3], activeTab: 3 },
        ],
      },
      tabs,
    );
    expect(layout.mode).toBe('hsplit');
    expect(layout.ratio).toBe(0.4);
    expect(layout.panes[1].activeTab).toBe(3);
  });

  it('adopts tabs the saved layout never mentioned', () => {
    const layout = hydrateLayout(
      { mode: 'single', panes: [{ tabIds: [1] }, { tabIds: [] }] },
      tabs,
    );
    expect(layout.panes[0].tabIds).toEqual([1, 2, 3]);
  });

  it('drops references to tabs that are gone', () => {
    const layout = hydrateLayout({ mode: 'vsplit', panes: [{ tabIds: [1] }, { tabIds: [99] }] }, [
      { id: 1 },
    ]);
    expect(layout.panes[1].tabIds).toEqual([]);
    expect(layout.mode).toBe('single');
  });

  it('claims a duplicated tab only once', () => {
    const layout = hydrateLayout(
      { mode: 'vsplit', panes: [{ tabIds: [1, 2] }, { tabIds: [2, 3] }] },
      tabs,
    );
    const all = [...layout.panes[0].tabIds, ...layout.panes[1].tabIds];
    expect([...all].sort()).toEqual([1, 2, 3]);
  });

  it('repairs an activeTab pointing outside its pane', () => {
    const layout = hydrateLayout(
      {
        mode: 'vsplit',
        panes: [
          { tabIds: [1], activeTab: 3 },
          { tabIds: [2, 3], activeTab: 2 },
        ],
      },
      tabs,
    );
    expect(layout.panes[0].activeTab).toBe(1);
    expect(layout.panes[1].activeTab).toBe(2);
  });
});
