import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { usePoll } from '../hooks/usePoll.js';
import { consumePendingPreview, consumePendingTerm } from '../lib/bus.js';
import {
  emptyLayout,
  hydrateLayout,
  isSplit,
  paneOf,
  addTab as addToPane,
  removeTab as removeFromPane,
  focusTab as focusInPane,
  moveTab as moveAcrossPanes,
  split as splitPanes,
  unsplit as unsplitPanes,
  setRatio as withRatio,
} from '../lib/layout.js';
import TermView from '../components/workspace/TermView.jsx';
import PreviewFrame from '../components/workspace/PreviewFrame.jsx';

function normalize(url) {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : 'http://' + url;
}

export default function Workspace() {
  const [projects, setProjects] = useState([]);
  const [ptyAvailable, setPtyAvailable] = useState(true);
  // { id, kind: 'term'|'preview', label, cwd?, cmd?, sessionId?, url?, reloadKey? }
  // sessionId addresses a shell on the server; the tab is just a view onto it.
  const [tabs, setTabs] = useState([]);
  // Which tabs sit in which pane, and what is focused in each. Tab contents are
  // in `tabs`; this only holds the arrangement.
  const [layout, setLayout] = useState(emptyLayout);
  // The pane new tabs open into and the toolbar acts on.
  const [focusedPane, setFocusedPane] = useState(0);
  const [urlInput, setUrlInput] = useState('');
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const counter = useRef(0);
  const splitRef = useRef(null);

  const activeTab = layout.panes[focusedPane].activeTab;

  function setActiveTab(id) {
    const pane = paneOf(layout, id);
    if (pane !== -1) setFocusedPane(pane);
    setLayout((l) => focusInPane(l, id));
  }

  const refreshSessions = useCallback(
    () =>
      api('/terminals')
        .then((d) => setSessions(d.sessions || []))
        .catch(() => {}),
    [],
  );
  // Also refreshed eagerly after a kill so the list doesn't lag a tick behind.
  usePoll(refreshSessions, () => {}, 10000);

  // Restore the saved workspace, then reconcile it against the shells the server
  // actually still has. A tab whose session is alive reattaches silently; one
  // whose session is gone (hub restarted, reaper collected it) respawns in the
  // same cwd and says so, rather than passing a fresh shell off as the old one.
  useEffect(() => {
    Promise.all([
      api('/workspace').catch(() => ({ tabs: [], layout: null })),
      api('/terminals').catch(() => ({ sessions: [] })),
    ]).then(([state, term]) => {
      const live = new Set((term.sessions || []).map((s) => s.id));
      const restored = (state.tabs || []).map((t) =>
        t.kind === 'term' ? { ...t, resume: !live.has(t.sessionId) } : { ...t, reloadKey: 0 },
      );
      setTabs(restored);
      setLayout(hydrateLayout(state.layout, restored));
      counter.current = restored.reduce((max, t) => Math.max(max, t.id), 0);
      setHydrated(true);
    });
  }, []);

  // Debounced so dragging through tabs doesn't write on every keystroke-ish
  // change. Gated on `hydrated` so the initial empty state can't clobber the
  // saved one before it has loaded.
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      api('/workspace', {
        method: 'PUT',
        body: {
          // `cmd` is deliberately dropped: it's a one-shot scaffold command, and
          // replaying it on restore would re-run someone's `npm create`.
          tabs: tabs.map(({ id, kind, label, cwd, sessionId, url }) => ({
            id,
            kind,
            label,
            cwd,
            sessionId,
            url,
          })),
          layout,
        },
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [tabs, layout, hydrated]);

  useEffect(() => {
    api('/projects')
      .then(setProjects)
      .catch(() => {});
    api('/health')
      .then((h) => setPtyAvailable(h.terminals))
      .catch(() => {});
  }, []);

  // New tabs land in whichever pane has focus.
  function openTab(tab) {
    setTabs((t) => [...t, tab]);
    setLayout((l) => addToPane(l, tab.id, focusedPane));
  }

  function openTerm(label, cwd, cmd) {
    const id = ++counter.current;
    openTab({
      id,
      kind: 'term',
      label: `${label} #${id}`,
      cwd,
      cmd,
      sessionId: crypto.randomUUID(),
    });
  }

  // Adopt a shell that is already running on the server — used to reclaim a
  // session no tab points at anymore (hub reopened, browser crashed, etc).
  function adoptSession(s) {
    const existing = tabs.find((t) => t.sessionId === s.id);
    if (existing) {
      setActiveTab(existing.id);
      return;
    }
    const id = ++counter.current;
    const name = s.label || s.cwd.split('/').filter(Boolean).pop() || 'home';
    openTab({ id, kind: 'term', label: `${name} #${id}`, cwd: s.cwd, sessionId: s.id });
  }

  function openPreviewTab(label, url) {
    const norm = normalize(url);
    if (!norm) return;
    const existing = tabs.find((t) => t.kind === 'preview' && t.url === norm);
    if (existing) {
      setActiveTab(existing.id);
      return;
    }
    const id = ++counter.current;
    openTab({
      id,
      kind: 'preview',
      label: label || norm.replace(/^https?:\/\//, ''),
      url: norm,
      reloadKey: 0,
    });
  }

  function killSession(sid) {
    api(`/terminals/${sid}`, { method: 'DELETE' })
      .then(refreshSessions)
      .catch(() => {});
    const doomed = tabs.filter((t) => t.sessionId === sid).map((t) => t.id);
    setTabs((t) => t.filter((tab) => tab.sessionId !== sid));
    setLayout((l) => doomed.reduce(removeFromPane, l));
  }

  // Preview requests coming from other pages (Projects "Preview" buttons, links, workflows).
  // Keep the handler in a ref so the event subscription mounts once instead of
  // re-subscribing on every tabs change (openPreviewTab closes over `tabs` for dedup).
  const openPreviewRef = useRef(openPreviewTab);
  useEffect(() => {
    openPreviewRef.current = openPreviewTab;
  });
  useEffect(() => {
    function onOpen() {
      const p = consumePendingPreview();
      if (p) openPreviewRef.current(p.label, p.url);
    }
    onOpen(); // consume anything queued before mount
    window.addEventListener('hub:open-preview', onOpen);
    return () => window.removeEventListener('hub:open-preview', onOpen);
  }, []);

  // Terminal requests coming from other pages (Templates "Scaffold" buttons).
  // Same pattern as previews: keep the opener in a ref so we subscribe once.
  const openTermRef = useRef(openTerm);
  useEffect(() => {
    openTermRef.current = openTerm;
  });
  useEffect(() => {
    function onOpenTerm() {
      const t = consumePendingTerm();
      if (t) openTermRef.current(t.label, t.cwd, t.cmd);
    }
    onOpenTerm(); // consume anything queued before mount
    window.addEventListener('hub:open-term', onOpenTerm);
    return () => window.removeEventListener('hub:open-term', onOpenTerm);
  }, []);

  // Closing a terminal tab is the one gesture that means "kill this shell" —
  // everything else (refresh, navigating away, closing the browser) now detaches.
  function closeTab(id) {
    const tab = tabs.find((t) => t.id === id);
    if (tab?.kind === 'term' && tab.sessionId) {
      api(`/terminals/${tab.sessionId}`, { method: 'DELETE' })
        .then(refreshSessions)
        .catch(() => {});
    }
    setTabs((t) => t.filter((tab) => tab.id !== id));
    setLayout((l) => removeFromPane(l, id));
  }

  function reloadActive() {
    setTabs((t) =>
      t.map((tab) => (tab.id === activeTab ? { ...tab, reloadKey: tab.reloadKey + 1 } : tab)),
    );
  }

  // Dragging the divider. Ratio is read off the container rather than tracked as
  // a pixel delta, so it stays correct if the window resizes mid-drag.
  function startDividerDrag(e) {
    e.preventDefault();
    const vertical = layout.mode === 'vsplit';
    const onMove = (ev) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = vertical
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height;
      setLayout((l) => withRatio(l, ratio));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    // Without this the drag selects the page text it passes over.
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const quickLinks = projects.flatMap((p) =>
    (p.previews || []).map((pr) => ({ label: `${p.name}/${pr.name}`, url: pr.url })),
  );
  const active = tabs.find((t) => t.id === activeTab);
  // A live shell no open tab points at. Deliberately only flagged, never
  // auto-killed: a second hub window would otherwise reap the first one's shells.
  const orphans = sessions.filter((s) => !tabs.some((t) => t.sessionId === s.id));
  const split = isSplit(layout);

  // Each pane owns a tab strip and its tabs' contents. Every tab stays mounted
  // and is merely hidden when inactive, so a terminal keeps its xterm instance
  // while you switch around it.
  function renderPane(index) {
    const pane = layout.panes[index];
    const paneTabs = pane.tabIds.map((id) => tabs.find((t) => t.id === id)).filter(Boolean);
    const focused = split && focusedPane === index;

    return (
      <div
        onMouseDown={() => setFocusedPane(index)}
        style={
          split ? { flex: `${index === 0 ? layout.ratio : 1 - layout.ratio} 1 0%` } : undefined
        }
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {paneTabs.length > 0 && (
          <div className="my-2 flex flex-wrap gap-1">
            {paneTabs.map((t) => (
              <div
                key={t.id}
                className={'tab' + (pane.activeTab === t.id ? ' active' : '')}
                onClick={() => setActiveTab(t.id)}
                title={t.kind === 'preview' ? t.url : t.cwd || 'home'}
              >
                <span className={t.kind === 'term' ? 'tab-glyph font-mono' : 'tab-glyph'}>
                  {t.kind === 'term' ? '❯' : '⌗'}
                </span>
                {t.label}
                {tabs.length > 1 && (
                  <span
                    className="tab-close"
                    title={split ? 'Move to the other pane' : 'Split off into its own pane'}
                    onClick={(e) => {
                      e.stopPropagation();
                      setLayout((l) => moveAcrossPanes(l, t.id));
                    }}
                  >
                    ⇄
                  </span>
                )}
                <span
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                >
                  ✕
                </span>
              </div>
            ))}
          </div>
        )}

        {split && paneTabs.length === 0 && (
          <div className="card empty my-2">
            Empty pane — use ⇄ on a tab to move it here, or open a terminal while this pane has
            focus.
          </div>
        )}

        <div
          className={
            'flex min-h-0 flex-1 flex-col' + (focused ? ' rounded-md ring-1 ring-accent' : '')
          }
        >
          {paneTabs.map((t) =>
            t.kind === 'term' ? (
              <TermView
                key={'t' + t.id}
                sessionId={t.sessionId}
                cwd={t.cwd}
                cmd={t.cmd}
                resume={t.resume}
                visible={pane.activeTab === t.id}
              />
            ) : (
              <PreviewFrame key={'p' + t.id} tab={t} visible={pane.activeTab === t.id} />
            ),
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full max-w-none flex-col px-2 pt-1.5 pb-2">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <select
          className="mt-0 w-auto"
          value=""
          onChange={(e) => {
            if (e.target.value === '::home') openTerm('home', '');
            else {
              const p = projects.find((x) => x.id === e.target.value);
              if (p) openTerm(p.name, p.path);
            }
          }}
          disabled={!ptyAvailable}
        >
          <option value="" disabled>
            + Terminal…
          </option>
          <option value="::home">home</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {quickLinks.length > 0 && (
          <select
            className="mt-0 w-auto"
            value=""
            onChange={(e) => {
              const q = quickLinks.find((x) => x.label === e.target.value);
              if (q) openPreviewTab(q.label, q.url);
            }}
          >
            <option value="" disabled>
              + Preview…
            </option>
            {quickLinks.map((q) => (
              <option key={q.label} value={q.label}>
                {q.label}
              </option>
            ))}
          </select>
        )}
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              openPreviewTab(null, urlInput);
              setUrlInput('');
            }
          }}
          placeholder="localhost:4000"
          style={{ width: 160, marginTop: 0 }}
        />
        <button
          className="btn small"
          onClick={() => {
            openPreviewTab(null, urlInput);
            setUrlInput('');
          }}
          disabled={!urlInput.trim()}
        >
          Open
        </button>

        <span className="flex-1" />
        {!split && tabs.length > 1 && (
          <button
            className="btn small"
            onClick={() => setLayout((l) => splitPanes(l, 'vsplit', focusedPane))}
            title="Split the workspace, moving the current tab to the new pane"
          >
            ⫿ Split
          </button>
        )}
        {split && (
          <>
            <button
              className="btn small"
              onClick={() =>
                setLayout((l) => ({ ...l, mode: l.mode === 'vsplit' ? 'hsplit' : 'vsplit' }))
              }
              title={layout.mode === 'vsplit' ? 'Stack the panes' : 'Place the panes side by side'}
            >
              {layout.mode === 'vsplit' ? '⫽' : '⫿'}
            </button>
            <button
              className="btn small"
              onClick={() => setLayout(unsplitPanes)}
              title="Merge both panes back into one"
            >
              Unsplit
            </button>
          </>
        )}
        {sessions.length > 0 && (
          <button
            className="btn small"
            onClick={() => setShowSessions((v) => !v)}
            title="Shells running on the server"
          >
            Sessions {sessions.length}
            {orphans.length > 0 && ` · ${orphans.length} orphaned`}
          </button>
        )}
        {active?.kind === 'preview' && (
          <>
            <button className="btn small" onClick={reloadActive} title="Reload">
              ⟳
            </button>
            <a
              className="btn small"
              href={active.url}
              target="_blank"
              rel="noreferrer"
              title="Open in new tab"
            >
              ↗
            </a>
          </>
        )}
      </div>

      {showSessions && (
        <div className="card my-1.5">
          <div className="mb-1 text-sm opacity-70">
            Shells keep running when you close the hub or refresh. Idle shells sitting at a prompt
            are cleaned up after a day; anything still running is left alone and listed here.
          </div>
          {sessions.map((s) => {
            const orphaned = !tabs.some((t) => t.sessionId === s.id);
            return (
              <div key={s.id} className="flex items-center gap-2 border-t border-border py-1">
                <span className="font-mono text-sm">{s.cwd}</span>
                {!s.atPrompt && (
                  <span className="font-mono text-sm opacity-70">{s.foreground}</span>
                )}
                <span className="flex-1" />
                <span className="text-sm opacity-70">
                  {s.attached ? 'attached' : orphaned ? 'orphaned' : 'detached'}
                </span>
                {orphaned && (
                  <button className="btn small" onClick={() => adoptSession(s)}>
                    Attach
                  </button>
                )}
                <button className="btn small" onClick={() => killSession(s.id)}>
                  Kill
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!ptyAvailable && (
        <div className="card my-1.5 text-red">
          node-pty is not installed, so terminals are disabled. Run{' '}
          <span className="font-mono">npm install node-pty</span> in the dev-hub folder (needs Xcode
          Command Line Tools), then restart the server.
        </div>
      )}

      {hydrated && tabs.length === 0 && (
        <div className="card empty">
          One surface for shells and running apps. Open a terminal in your home folder or any
          project (tip: run <span className="font-mono">claude</span> inside one), and open previews
          of your services next to it — set preview URLs per project (Projects → Edit) to get
          one-click entries. Tabs stay alive while you move around the hub.
        </div>
      )}

      <div
        ref={splitRef}
        className={
          'flex min-h-0 flex-1 ' + (layout.mode === 'vsplit' ? 'flex-row gap-0' : 'flex-col gap-0')
        }
      >
        {renderPane(0)}
        {split && (
          <div
            onMouseDown={startDividerDrag}
            className={
              'shrink-0 bg-border transition-colors hover:bg-accent ' +
              (layout.mode === 'vsplit' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize')
            }
            title="Drag to resize"
          />
        )}
        {split && renderPane(1)}
      </div>
    </div>
  );
}
