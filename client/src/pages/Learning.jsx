import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Trash2, Plus, ExternalLink } from 'lucide-react';
import { api } from '../api.js';
import { useConfirm } from '../components/common/ConfirmDialog.jsx';

const COLUMNS = [
  { id: 'queued', label: 'Queued', dot: 'bg-muted', line: 'var(--color-muted)' },
  { id: 'learning', label: 'Learning', dot: 'bg-accent', line: 'var(--color-accent)' },
  { id: 'done', label: 'Done', dot: 'bg-green', line: 'var(--color-green)' },
];

// Show a clean hostname for a link instead of the full, often-long URL.
function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

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
      {error && <div className="my-1.5 text-red">{error}</div>}
      <div className="my-1.5 flex flex-wrap items-center gap-2">
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
    <div className="max-w-[1100px] p-6">
      <h2>Learning queue</h2>
      <div className="my-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">
          Everything you want to learn next, so nothing gets lost. Finished items stay as a record
          of what you have learned.
        </p>
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Plus size={14} />
          Add
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

      <div className="mt-3 grid grid-cols-3 gap-3">
        {COLUMNS.map((col) => {
          const colItems = visible.filter((i) => i.status === col.id);
          return (
            <div key={col.id}>
              <h3 className="mb-2 flex items-center gap-2 border-b border-border pb-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${col.dot}`} />
                {col.label}
                <span className="ml-auto rounded-full bg-bg-3 px-2 py-0.5 text-[11px] font-normal text-muted">
                  {colItems.length}
                </span>
              </h3>
              <div className="flex flex-col gap-2">
                {colItems.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted">
                    Nothing here
                  </div>
                )}
                {colItems.map((item) => (
                  <div
                    className="group rounded-lg border border-border bg-bg-2 p-3 transition-colors hover:border-muted"
                    style={{ borderLeftWidth: '3px', borderLeftColor: col.line }}
                    key={item.id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <strong className="leading-snug">{item.title}</strong>
                      <button
                        className="shrink-0 cursor-pointer rounded p-1 text-muted opacity-0 transition hover:bg-bg-3 hover:text-red focus:opacity-100 group-hover:opacity-100"
                        onClick={() => remove(item)}
                        title="Delete item"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 flex items-center gap-1 text-[12px] no-underline hover:underline"
                        title={item.url}
                      >
                        <ExternalLink size={12} className="shrink-0" />
                        <span className="truncate">{hostname(item.url)}</span>
                      </a>
                    )}
                    {item.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.tags.map((t) => (
                          <span
                            className="rounded-[10px] border border-accent/40 bg-accent/10 px-2 py-px text-[11px] font-medium text-accent"
                            key={t}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <div className="mt-2 border-t border-border pt-2 text-[12px] leading-relaxed text-muted">
                        {item.notes}
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-1.5">
                      {col.id !== 'queued' && (
                        <button
                          className="btn small"
                          onClick={() => setStatus(item, col.id === 'done' ? 'learning' : 'queued')}
                          title={col.id === 'done' ? 'Move back to Learning' : 'Move back to Queued'}
                        >
                          <ArrowLeft size={13} />
                        </button>
                      )}
                      {col.id !== 'done' && (
                        <button
                          className="btn small primary"
                          onClick={() =>
                            setStatus(item, col.id === 'queued' ? 'learning' : 'done')
                          }
                        >
                          {col.id === 'queued' ? 'Start' : 'Done'}
                          <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
