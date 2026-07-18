import { useEffect } from 'react';

/**
 * Poll `fetch` immediately on mount and then every `intervalMs`, passing each
 * result to `onData`. Results that arrive after unmount are dropped, and
 * transient fetch errors are swallowed (polling simply retries on the next
 * tick). Re-subscribes whenever a value in `deps` changes.
 *
 * Replaces the hand-rolled `let alive; poll(); setInterval; cleanup` pattern
 * that was copy-pasted across the crash badge, project statuses, and log panel.
 */
export function usePoll(fetch, onData, intervalMs, deps = []) {
  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const data = await fetch();
        if (alive) onData(data);
      } catch {
        /* polling — ignore transient errors, retry next tick */
      }
    }
    tick();
    const t = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // deps is an explicit dependency list supplied by the caller, mirroring the
    // original inline effects; the linter can't verify a spread array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
