import { useEffect, useState } from 'react';

// Global transient notifications. Mounted once in App; anyone fires one via
// bus.notify(). Each toast auto-dismisses after a few seconds, or on click.
const TTL_MS = 4500;

export default function Toasts() {
  const [toasts, setToasts] = useState([]); // { id, message, kind }

  useEffect(() => {
    function onToast(e) {
      const id = Date.now() + Math.random();
      const { message, kind } = e.detail;
      setToasts((t) => [...t, { id, message, kind }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TTL_MS);
    }
    window.addEventListener('hub:toast', onToast);
    return () => window.removeEventListener('hub:toast', onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
          className={
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] shadow-lg ' +
            'border-border bg-bg-2 text-text hover:border-muted'
          }
        >
          <span
            className={
              'inline-block size-2 shrink-0 rounded-full ' +
              (t.kind === 'err' ? 'bg-red' : t.kind === 'warn' ? 'bg-orange' : 'bg-green')
            }
          />
          {t.message}
        </button>
      ))}
    </div>
  );
}
