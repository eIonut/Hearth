export async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    let data = null;
    try {
      data = await res.json();
      msg = data.error || msg;
    } catch {
      /* response body not JSON — keep statusText */
    }
    const err = new Error(msg);
    if (data) err.data = data; // e.g. sync secret-scan findings
    throw err;
  }
  return res.json();
}
