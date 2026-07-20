import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

// `sessionId` addresses a shell living on the server, not in this component.
// Remounting (or a full page reload) reattaches to that same shell and replays
// its scrollback, so refreshing the hub no longer kills what you were running.
export default function TermView({ sessionId, cwd, cmd, resume, visible }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);

  useEffect(() => {
    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, monospace',
      theme: { background: '#0d1117' },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const params = new URLSearchParams({ id: sessionId, cwd: cwd || '' });
    if (cmd) params.set('cmd', cmd);
    if (resume) params.set('resume', '1');
    const ws = new WebSocket(`${proto}://${location.host}/term?${params}`);
    // Set when we are the ones closing (unmount, moving the tab between panes).
    // Without it a remount prints a "disconnected" notice into a terminal that
    // is about to reattach perfectly happily.
    let teardown = false;
    ws.onmessage = (e) => term.write(e.data);
    // A closed socket no longer means a dead shell — it usually means the
    // connection dropped while the shell kept running. If the shell itself
    // exited, the server said so before closing.
    ws.onclose = () => {
      if (!teardown) term.write('\r\n[disconnected — reload to reattach]\r\n');
    };
    term.onData((d) => {
      if (ws.readyState === 1) ws.send(d);
    });

    function doFit() {
      fit.fit();
      if (ws.readyState === 1) ws.send(`\x00resize:${term.cols},${term.rows}`);
    }
    const onResize = () => doFit();
    window.addEventListener('resize', onResize);
    ws.onopen = () => doFit();

    // The window is not the only thing that resizes a terminal: splitting the
    // workspace, dragging the divider, or moving this tab to the other pane all
    // change the box without a window resize event. Watching the container
    // keeps the pty's row/column count honest in every one of those cases.
    let pending = null;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(doFit);
    });
    observer.observe(containerRef.current);

    termRef.current = { term, fit, ws, doFit };
    return () => {
      teardown = true;
      observer.disconnect();
      cancelAnimationFrame(pending);
      window.removeEventListener('resize', onResize);
      try {
        ws.close();
      } catch {
        /* socket may already be closed */
      }
      term.dispose();
    };
    // Keyed on the session alone: cwd/cmd only ever apply at spawn time, and
    // reconnecting to the same id must not respawn anything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (visible && termRef.current) setTimeout(() => termRef.current.doFit(), 30);
  }, [visible]);

  // min-h-0 rather than a fixed floor: a stacked pane has to be able to shrink
  // the terminal, otherwise it overflows into the pane below it.
  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 rounded-md border border-border bg-bg p-1"
      style={{ display: visible ? 'block' : 'none' }}
    />
  );
}
