import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useConfirm } from '../components/ConfirmDialog.jsx';

const COLUMNS = [
  { id: 'idea', label: 'Ideas' },
  { id: 'drafted', label: 'Drafted' },
  { id: 'posted', label: 'Posted' },
];
const PLATFORMS = ['tiktok', 'x', 'linkedin'];

function DraftViewer({ item, onClose, onSaved }) {
  const [drafts, setDrafts] = useState(item.drafts || { tiktok: '', x: '', linkedin: '' });
  const [tab, setTab] = useState('tiktok');
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(drafts[tab] || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function save() {
    await api(`/content/${item.id}`, { method: 'PUT', body: { drafts } });
    onSaved();
  }

  return (
    <div className="card">
      <div className="row space-between">
        <h3>{item.title} — drafts</h3>
        <div>
          <button className="btn small primary" onClick={copy}>
            {copied ? 'Copied!' : 'Copy ' + tab}
          </button>
          <button className="btn small" onClick={save}>
            Save edits
          </button>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="tab-bar">
        {PLATFORMS.map((p) => (
          <div key={p} className={'tab' + (tab === p ? ' active' : '')} onClick={() => setTab(p)}>
            {p}
          </div>
        ))}
      </div>
      <textarea
        rows={14}
        className="mono"
        value={drafts[tab] || ''}
        onChange={(e) => setDrafts((d) => ({ ...d, [tab]: e.target.value }))}
      />
    </div>
  );
}

export default function ContentPage() {
  const [tils, setTils] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedTils, setSelectedTils] = useState({});
  const [newTitle, setNewTitle] = useState('');
  const [generating, setGenerating] = useState({});
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState('');
  const confirm = useConfirm();

  async function load() {
    setTils(await api('/tils'));
    setItems(await api('/content'));
  }
  useEffect(() => {
    load();
  }, []);

  async function createIdea() {
    setError('');
    const sourceTilIds = Object.keys(selectedTils).filter((id) => selectedTils[id]);
    try {
      await api('/content', { method: 'POST', body: { title: newTitle, sourceTilIds } });
      setNewTitle('');
      setSelectedTils({});
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function generate(item) {
    setError('');
    setGenerating((g) => ({ ...g, [item.id]: true }));
    try {
      const updated = await api(`/content/${item.id}/generate`, { method: 'POST', body: {} });
      setViewing(updated);
      load();
    } catch (e) {
      setError(e.message);
    }
    setGenerating((g) => ({ ...g, [item.id]: false }));
  }

  async function setStatus(item, status) {
    await api(`/content/${item.id}`, { method: 'PUT', body: { status } });
    load();
  }

  async function removeItem(item) {
    if (!(await confirm(`Delete "${item.title}"?`))) return;
    await api(`/content/${item.id}`, { method: 'DELETE' });
    load();
  }

  async function removeTil(til) {
    if (!(await confirm('Delete this TIL?'))) return;
    await api(`/tils/${til.id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <p className="muted">
        Turn what you learn into TikTok scripts, X threads, and LinkedIn posts. Log TILs with the
        bar at the top of the app.
      </p>
      {error && <div className="error">{error}</div>}

      <div className="content-layout">
        <div className="til-column">
          <h3>TIL log ({tils.length})</h3>
          {tils.length === 0 && (
            <div className="muted small-text">
              Nothing yet. Log what you learn — it becomes content.
            </div>
          )}
          {tils.map((t) => (
            <div className="card compact" key={t.id}>
              <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto', marginTop: 3 }}
                  checked={!!selectedTils[t.id]}
                  onChange={(e) => setSelectedTils((s) => ({ ...s, [t.id]: e.target.checked }))}
                />
                <div style={{ flex: 1 }}>
                  <div className="small-text">{t.text}</div>
                  <div className="muted small-text">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button className="btn small danger" onClick={() => removeTil(t)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="ideas-column">
          <div className="card form-card">
            <h3>New content idea</h3>
            <div className="row">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder='e.g. "Why your useEffect runs twice"'
              />
              <button className="btn primary" disabled={!newTitle.trim()} onClick={createIdea}>
                Create{Object.values(selectedTils).some(Boolean) ? ' from selected TILs' : ''}
              </button>
            </div>
          </div>

          <div className="board">
            {COLUMNS.map((col) => {
              const colItems = items.filter((i) => i.status === col.id);
              return (
                <div className="column" key={col.id}>
                  <h3>
                    {col.label} <span className="muted">({colItems.length})</span>
                  </h3>
                  {colItems.map((item) => (
                    <div className="card compact" key={item.id}>
                      <div className="row space-between">
                        <strong className="small-text">{item.title}</strong>
                        <button className="btn small danger" onClick={() => removeItem(item)}>
                          ✕
                        </button>
                      </div>
                      {item.sourceTilIds.length > 0 && (
                        <div className="muted small-text">
                          {item.sourceTilIds.length} TIL{item.sourceTilIds.length > 1 ? 's' : ''}
                        </div>
                      )}
                      <div className="row">
                        <button
                          className="btn small primary"
                          disabled={generating[item.id]}
                          onClick={() => generate(item)}
                        >
                          {generating[item.id]
                            ? 'Generating…'
                            : item.drafts
                              ? 'Regenerate'
                              : 'Generate drafts'}
                        </button>
                        {item.drafts && (
                          <button className="btn small" onClick={() => setViewing(item)}>
                            View drafts
                          </button>
                        )}
                        {col.id === 'drafted' && (
                          <button className="btn small" onClick={() => setStatus(item, 'posted')}>
                            Mark posted
                          </button>
                        )}
                        {col.id === 'posted' && (
                          <button className="btn small" onClick={() => setStatus(item, 'drafted')}>
                            ← Drafted
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {viewing && (
            <DraftViewer
              item={viewing}
              onClose={() => setViewing(null)}
              onSaved={() => {
                setViewing(null);
                load();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
