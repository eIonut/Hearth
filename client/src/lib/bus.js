// Tiny event bus so any page can open a preview or terminal tab in the Workspace.
let pendingPreview = null;
let pendingTerm = null;

export function openPreview(label, url) {
  pendingPreview = { label, url };
  window.dispatchEvent(new Event('hub:open-preview'));
}

export function consumePendingPreview() {
  const p = pendingPreview;
  pendingPreview = null;
  return p;
}

// Open a Workspace terminal, optionally auto-running a command (used by
// project templates / one-click scaffolding).
export function openTerm(label, cwd, cmd) {
  pendingTerm = { label, cwd, cmd };
  window.dispatchEvent(new Event('hub:open-term'));
}

export function consumePendingTerm() {
  const t = pendingTerm;
  pendingTerm = null;
  return t;
}

// Fire a transient toast notification, shown by the <Toasts> container mounted
// in App. `kind` is 'ok' | 'warn' | 'err' (styling only).
export function notify(message, kind = 'ok') {
  window.dispatchEvent(new CustomEvent('hub:toast', { detail: { message, kind } }));
}
