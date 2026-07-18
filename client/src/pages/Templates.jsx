import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { openTerm } from '../lib/bus.js';
import { useConfirm } from '../components/common/ConfirmDialog.jsx';

// One command per line; blank lines are dropped.
function parseCommands(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function TemplateForm({ initial, onSaved, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [cwd, setCwd] = useState(initial?.cwd || '');
  const [commandsText, setCommandsText] = useState((initial?.commands || []).join('\n'));
  const [error, setError] = useState('');

  const commands = parseCommands(commandsText);

  async function save() {
    setError('');
    const body = { name, cwd, commands };
    try {
      if (initial?.id) await api(`/templates/${initial.id}`, { method: 'PUT', body });
      else await api('/templates', { method: 'POST', body });
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card form-card">
      <h3>{initial?.id ? 'Edit template' : 'New template'}</h3>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="React (Vite)" />
      </label>
      <label>
        Folder to run in (optional)
        <input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="~/Work" />
      </label>
      <label>
        Commands (one per line, run in order)
        <textarea
          rows={5}
          value={commandsText}
          onChange={(e) => setCommandsText(e.target.value)}
          placeholder={
            'npm create vite@latest my-app -- --template react\ncd my-app\nnpm install\nnpm run dev'
          }
        />
      </label>

      {error && <div className="my-1.5 text-red">{error}</div>}
      <div className="my-1.5 flex flex-wrap items-center gap-2">
        <button
          className="btn primary"
          onClick={save}
          disabled={!name.trim() || commands.length === 0}
        >
          Save
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null);
  const confirm = useConfirm();

  async function load() {
    setTemplates(await api('/templates'));
  }
  useEffect(() => {
    load();
  }, []);

  function scaffold(t) {
    openTerm(t.name, t.cwd, t.commands.join(' && '));
  }

  async function remove(t) {
    if (!(await confirm(`Delete template "${t.name}"?`))) return;
    await api(`/templates/${t.id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <div className="my-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">
          One-click project scaffolding: a named command sequence (e.g. create → install → dev) that
          runs in a Workspace terminal, so interactive prompts work and the dev server stays live in
          that tab.
        </p>
        <button className="btn primary" onClick={() => setEditing({})}>
          + New template
        </button>
      </div>

      {editing && (
        <TemplateForm
          initial={editing.id ? editing : null}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {templates.length === 0 && !editing && (
        <div className="card empty">
          No templates yet. Create one for your usual stack — the commands you run to spin up a new
          project — then scaffold it in one click.
        </div>
      )}

      {templates.map((t) => (
        <div className="card" key={t.id}>
          <div className="my-1.5 flex flex-wrap items-center justify-between gap-2">
            <h3 style={{ margin: 0 }}>{t.name}</h3>
            <div>
              <button className="btn small primary" onClick={() => scaffold(t)}>
                ▶ Scaffold
              </button>
              <button className="btn small" onClick={() => setEditing(t)}>
                Edit
              </button>
              <button className="btn small danger" onClick={() => remove(t)}>
                ✕
              </button>
            </div>
          </div>
          {t.cwd && <div className="text-[12px] text-muted">in {t.cwd}</div>}
          <div className="font-mono text-[12px] text-muted">{t.commands.join('  →  ')}</div>
        </div>
      ))}
    </div>
  );
}
