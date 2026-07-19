import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useConfirm } from '../components/common/ConfirmDialog.jsx';

function NoteForm({ initial, onSaved, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [body, setBody] = useState(initial?.body || '');
  const [error, setError] = useState('');

  async function save() {
    setError('');
    const payload = { title, body };
    try {
      if (initial?.id) await api(`/notes/${initial.id}`, { method: 'PUT', body: payload });
      else await api('/notes', { method: 'POST', body: payload });
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card form-card">
      <h3>{initial?.id ? 'Edit note' : 'New note'}</h3>
      <label>
        Title (optional)
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled note"
        />
      </label>
      <label>
        Note
        <textarea
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Jot something down…"
        />
      </label>
      {error && <div className="my-1.5 text-red">{error}</div>}
      <div className="my-1.5 flex flex-wrap items-center gap-2">
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

function when(ts) {
  return new Date(ts).toLocaleString();
}

export default function Notes() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const confirm = useConfirm();

  async function load() {
    setItems(await api('/notes'));
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(item) {
    if (!(await confirm(`Delete note "${item.title || 'Untitled'}"?`))) return;
    await api(`/notes/${item.id}`, { method: 'DELETE' });
    load();
  }

  const q = query.toLowerCase();
  const filtered = items.filter(
    (n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
  );

  return (
    <div>
      <div className="my-1.5 flex flex-wrap items-center justify-between gap-2">
        <input
          className="my-2 max-w-[420px]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes…"
          style={{ flex: 1 }}
        />
        <button className="btn primary" onClick={() => setEditing({})}>
          + New note
        </button>
      </div>

      {editing && (
        <NoteForm
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
          {items.length === 0 ? 'No notes yet. Jot down anything worth remembering.' : 'No matches.'}
        </div>
      )}

      {filtered.map((n) => (
        <div className="card" key={n.id}>
          <div className="my-1.5 flex flex-wrap items-center justify-between gap-2">
            <h3>{n.title || 'Untitled'}</h3>
            <div>
              <button className="btn small" onClick={() => setEditing(n)}>
                Edit
              </button>
              <button className="btn small danger" onClick={() => remove(n)}>
                ✕
              </button>
            </div>
          </div>
          <div className="text-[12px] text-muted">Updated {when(n.updatedAt)}</div>
          {/* prettier-ignore */}
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border bg-bg p-2.5 text-[13px]">{n.body}</pre>
        </div>
      ))}
    </div>
  );
}
