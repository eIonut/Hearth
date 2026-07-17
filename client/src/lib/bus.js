// Tiny event bus so any page can open a preview tab in the Preview page.
let pendingPreview = null;

export function openPreview(label, url) {
  pendingPreview = { label, url };
  window.dispatchEvent(new Event('hub:open-preview'));
}

export function consumePendingPreview() {
  const p = pendingPreview;
  pendingPreview = null;
  return p;
}
