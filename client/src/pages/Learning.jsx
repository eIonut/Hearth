import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useConfirm } from '../components/common/ConfirmDialog.jsx';

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
      {error && <div className="text-red my-1.5">{error}</div>}
      <div className="flex gap-2 items-center flex-wrap my-1.5">
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
      <div className="flex gap-2 items-center flex-wrap my-1.5 justify-between">
        <p className="text-muted">
          Everything you want to learn next, so nothing gets lost. Finished items are raw material
          for your content.
        </p>
        <button className="btn primary" onClick={() => setAdding(true)}>
          + Add
        </button>
      </div>

      <input
        className="my-2 max-w-[420px]"
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

      <div className="mt-2 grid grid-cols-3 gap-3">
        {COLUMNS.map((col) => {
          const colItems = visible.filter((i) => i.status === col.id);
          return (
            <div key={col.id}>
              <h3 className="border-b border-border pb-1.5">
                {col.label} <span className="text-muted">({colItems.length})</span>
              </h3>
              {colItems.map((item) => (
                <div className="card compact" key={item.id}>
                  <div className="flex gap-2 items-center flex-wrap my-1.5 justify-between">
                    <strong>{item.title}</strong>
                    <button className="btn small danger" onClick={() => remove(item)}>
                      ✕
                    </button>
                  </div>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-[12px]">
                      {item.url}
                    </a>
                  )}
                  {item.tags.length > 0 && (
                    <div className="text-[12px]">
                      {item.tags.map((t) => (
                        <span className="mr-1 rounded-[10px] bg-bg-3 px-2 py-px text-[11px] text-muted" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.notes && <div className="text-muted text-[12px]">{item.notes}</div>}
                  <div className="flex gap-2 items-center flex-wrap my-1.5">
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
