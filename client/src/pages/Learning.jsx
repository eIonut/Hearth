import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useConfirm } from '../components/ConfirmDialog.jsx';

const COLUMNS = [
  { id: 'queued', label: 'Queued' },
  { id: 'learning', label: 'Learning' },
  { id: 'done', label: 'Done' },
];

function ItemForm({ onSaved, onCancel }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      await api('/learning', {
        method: 'POST',
        body: {
          title,
          url,
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          notes,
        },
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card form-card">
      <h3>Add to learning queue</h3>
      <label>
        What do you want to learn?
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="React Server Components"
        />
      </label>
      <label>
        Link (article, video, docs)
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </label>
      <label>
        Tags
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="react, ai" />
      </label>
      <label>
        Notes
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Why this matters / what to focus on"
        />
      </label>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="btn primary" onClick={save}>
          Add
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function Learning() {
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('');
  const confirm = useConfirm();

  async function load() {
    setItems(await api('/learning'));
  }
  useEffect(() => {
    load();
  }, []);

  async function setStatus(item, status) {
    await api(`/learning/${item.id}`, { method: 'PUT', body: { status } });
    load();
  }

  async function remove(item) {
    if (!(await confirm(`Delete "${item.title}"?`))) return;
    await api(`/learning/${item.id}`, { method: 'DELETE' });
    load();
  }

  const f = filter.toLowerCase();
  const visible = items.filter(
    (i) =>
      !f || i.title.toLowerCase().includes(f) || i.tags.some((t) => t.toLowerCase().includes(f)),
  );

  return (
    <div>
      <div className="row space-between">
        <p className="muted">
          Everything you want to learn next, so nothing gets lost. Finished items are raw material
          for your content.
        </p>
        <button className="btn primary" onClick={() => setAdding(true)}>
          + Add
        </button>
      </div>

      <input
        className="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by title or tag…"
      />

      {adding && (
        <ItemForm
          onSaved={() => {
            setAdding(false);
            load();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="board">
        {COLUMNS.map((col) => {
          const colItems = visible.filter((i) => i.status === col.id);
          return (
            <div className="column" key={col.id}>
              <h3>
                {col.label} <span className="muted">({colItems.length})</span>
              </h3>
              {colItems.map((item) => (
                <div className="card compact" key={item.id}>
                  <div className="row space-between">
                    <strong>{item.title}</strong>
                    <button className="btn small danger" onClick={() => remove(item)}>
                      ✕
                    </button>
                  </div>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noreferrer" className="small-text">
                      {item.url}
                    </a>
                  )}
                  {item.tags.length > 0 && (
                    <div className="small-text">
                      {item.tags.map((t) => (
                        <span className="tag" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.notes && <div className="muted small-text">{item.notes}</div>}
                  <div className="row">
                    {col.id !== 'queued' && (
                      <button
                        className="btn small"
                        onClick={() => setStatus(item, col.id === 'done' ? 'learning' : 'queued')}
                      >
                        ←
                      </button>
                    )}
                    {col.id !== 'done' && (
                      <button
                        className="btn small primary"
                        onClick={() => setStatus(item, col.id === 'queued' ? 'learning' : 'done')}
                      >
                        →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
