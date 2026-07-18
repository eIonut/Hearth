import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useConfirm } from '../components/common/ConfirmDialog.jsx';

function SnippetForm({ initial, onSaved, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [language, setLanguage] = useState(initial?.language || 'bash');
  const [tags, setTags] = useState((initial?.tags || []).join(', '));
  const [body, setBody] = useState(initial?.body || '');
  const [error, setError] = useState('');

  async function save() {
    setError('');
    const payload = {
      title,
      language,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      body,
    };
    try {
      if (initial?.id) await api(`/snippets/${initial.id}`, { method: 'PUT', body: payload });
      else await api('/snippets', { method: 'POST', body: payload });
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card form-card">
      <h3>{initial?.id ? 'Edit snippet' : 'New snippet'}</h3>
      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Kill process on port"
        />
      </label>
      <div className="flex gap-2 items-center flex-wrap my-1.5">
        <label>
          Language
          <input value={language} onChange={(e) => setLanguage(e.target.value)} />
        </label>
        <label>
          Tags (comma-separated)
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="bash, ports" />
        </label>
      </div>
      <label>
        Snippet
        <textarea
          rows={6}
          className="font-mono"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="lsof -ti:3000 | xargs kill -9"
        />
      </label>
      {error && <div className="text-red my-1.5">{error}</div>}
      <div className="flex gap-2 items-center flex-wrap my-1.5">
        <button className="btn primary" onClick={save}>
          Save
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function Snippets() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const confirm = useConfirm();

  async function load() {
    setItems(await api('/snippets'));
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(item) {
    if (!(await confirm(`Delete snippet "${item.title}"?`))) return;
    await api(`/snippets/${item.id}`, { method: 'DELETE' });
    load();
  }

  async function copy(item) {
    await navigator.clipboard.writeText(item.body);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1200);
  }

  const q = query.toLowerCase();
  const filtered = items.filter(
    (s) =>
      !q ||
      s.title.toLowerCase().includes(q) ||
      s.language.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)) ||
      s.body.toLowerCase().includes(q),
  );

  return (
    <div>
      <div className="flex gap-2 items-center flex-wrap my-1.5 justify-between">
        <input
          className="my-2 max-w-[420px]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, tag, language, or content…"
          style={{ flex: 1 }}
        />
        <button className="btn primary" onClick={() => setEditing({})}>
          + New snippet
        </button>
      </div>

      {editing && (
        <SnippetForm
          initial={editing.id ? editing : null}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {filtered.length === 0 && !editing && (
        <div className="card empty">
          {items.length === 0
            ? 'No snippets yet. Save the commands you keep googling.'
            : 'No matches.'}
        </div>
      )}

      {filtered.map((s) => (
        <div className="card" key={s.id}>
          <div className="flex gap-2 items-center flex-wrap my-1.5 justify-between">
            <h3>{s.title}</h3>
            <div>
              <button className="btn small primary" onClick={() => copy(s)}>
                {copiedId === s.id ? 'Copied!' : 'Copy'}
              </button>
              <button className="btn small" onClick={() => setEditing(s)}>
                Edit
              </button>
              <button className="btn small danger" onClick={() => remove(s)}>
                ✕
              </button>
            </div>
          </div>
          <div className="text-muted text-[12px]">
            {s.language}
            {s.tags.length > 0 && ' · '}
            {s.tags.map((t) => (
              <span className="mr-1 rounded-[10px] bg-bg-3 px-2 py-px text-[11px] text-muted" key={t}>
                {t}
              </span>
            ))}
          </div>
          <pre className="mt-2 whitespace-pre-wrap break-all rounded-md border border-border bg-bg p-2.5 font-mono text-[12px]">{s.body}</pre>
        </div>
      ))}
    </div>
  );
}
