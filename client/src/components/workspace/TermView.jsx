import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export default function TermView({ cwd, cmd, visible }) {
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
    const cmdParam = cmd ? `&cmd=${encodeURIComponent(cmd)}` : '';
    const ws = new WebSocket(
      `${proto}://${location.host}/term?cwd=${encodeURIComponent(cwd || '')}${cmdParam}`,
    );
    ws.onmessage = (e) => term.write(e.data);
    ws.onclose = () => term.write('\r\n[connection closed]\r\n');
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

    termRef.current = { term, fit, ws, doFit };
    return () => {
      window.removeEventListener('resize', onResize);
      try {
        ws.close();
      } catch {
        /* socket may already be closed */
      }
      term.dispose();
    };
  }, [cwd, cmd]);

  useEffect(() => {
    if (visible && termRef.current) setTimeout(() => termRef.current.doFit(), 30);
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className="min-h-[400px] flex-1 rounded-md border border-border bg-bg p-1"
      style={{ display: visible ? 'block' : 'none' }}
    />
  );
}
