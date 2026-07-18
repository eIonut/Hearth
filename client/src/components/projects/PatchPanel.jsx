import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useConfirm } from '../common/ConfirmDialog.jsx';

const EMPTY_ENV_OP = { type: 'env-set', file: '.env', key: '', value: '', revert: '' };
const EMPTY_REPLACE_OP = { type: 'replace', file: '', find: '', replace: '' };

function OpEditor({ op, onChange, onRemove }) {
  function set(field, value) {
    onChange({ ...op, [field]: value });
  }

  return (
    <div className="card compact op-editor">
      <div className="flex gap-2 items-center flex-wrap my-1.5 justify-between">
        <select
          value={op.type}
          onChange={(e) =>
            onChange(
              e.target.value === 'env-set'
                ? { ...EMPTY_ENV_OP, file: op.file }
                : { ...EMPTY_REPLACE_OP, file: op.file },
            )
          }
        >
          <option value="env-set">Env value</option>
          <option value="replace">Text replace</option>
        </select>
        <button className="btn small danger" onClick={onRemove}>
          ✕
        </button>
      </div>

      <label>
        File (relative to project)
        <input
          value={op.file}
          onChange={(e) => set('file', e.target.value)}
          placeholder={op.type === 'env-set' ? '.env' : 'src/routes/index.jsx'}
        />
      </label>

      {op.type === 'env-set' ? (
        <>
          <div className="flex gap-2 items-center flex-wrap my-1.5">
            <label>
              Key
              <input
                value={op.key}
                onChange={(e) => set('key', e.target.value)}
                placeholder="IAM_API_URL"
              />
            </label>
            <label>
              Value when applied
              <input
                value={op.value}
                onChange={(e) => set('value', e.target.value)}
                placeholder="iam-a-dev-1.infra.al:30374"
              />
            </label>
          </div>
          <label>
            Value when reverted (optional — otherwise the previous value is restored)
            <input
              value={op.revert || ''}
              onChange={(e) => set('revert', e.target.value)}
              placeholder="leave empty to auto-restore"
            />
          </label>
        </>
      ) : (
        <>
          <label>
            Find
            <textarea
              rows={2}
              className="font-mono"
              value={op.find}
              onChange={(e) => set('find', e.target.value)}
              placeholder={'loader={checkAccessToken}'}
            />
          </label>
          <label>
            Replace with (revert swaps them back)
            <textarea
              rows={2}
              className="font-mono"
              value={op.replace}
              onChange={(e) => set('replace', e.target.value)}
              placeholder={'// loader={checkAccessToken}'}
            />
          </label>
        </>
      )}
    </div>
  );
}

function PatchForm({ projectId, initial, onSaved, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [ops, setOps] = useState(initial?.ops || [{ ...EMPTY_ENV_OP }]);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      if (initial?.id) await api(`/patches/${initial.id}`, { method: 'PUT', body: { name, ops } });
      else await api('/patches', { method: 'POST', body: { projectId, name, ops } });
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card form-card">
      <h3>{initial?.id ? 'Edit patch' : 'New patch'}</h3>
      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="point IAM at dev-1 + disable auth loader"
        />
      </label>

      {ops.map((op, i) => (
        <OpEditor
          key={i}
          op={op}
          onChange={(newOp) => setOps((o) => o.map((x, j) => (j === i ? newOp : x)))}
          onRemove={() => setOps((o) => o.filter((_, j) => j !== i))}
        />
      ))}

      <div className="flex gap-2 items-center flex-wrap my-1.5">
        <button className="btn small" onClick={() => setOps((o) => [...o, { ...EMPTY_ENV_OP }])}>
          + Env value
        </button>
        <button
          className="btn small"
          onClick={() => setOps((o) => [...o, { ...EMPTY_REPLACE_OP }])}
        >
          + Text replace
        </button>
      </div>

      {error && <div className="text-red my-1.5">{error}</div>}
      <div className="flex gap-2 items-center flex-wrap my-1.5">
        <button className="btn primary" onClick={save} disabled={!name.trim() || ops.length === 0}>
          Save
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function statusChip(status) {
  const map = {
    applied: ['green', 'applied'],
    'not-applied': ['gray', 'not applied'],
    mixed: ['orange', 'partially applied'],
    partial: ['orange', 'partial'],
    'file-missing': ['red', 'file missing'],
    'not-found': ['red', 'text not found'],
  };
  const [color, label] = map[status] || ['gray', status];
  return <span className={`chip ${color}`}>{label}</span>;
}

function opSummary(op) {
  if (op.type === 'env-set') return `${op.file} · ${op.key}=${op.value}`;
  const short = (s) => (s.length > 40 ? s.slice(0, 40) + '…' : s);
  return `${op.file} · "${short(op.find)}" → "${short(op.replace)}"`;
}

// Patches for one project, shown inside its card on the Projects page.
export default function PatchPanel({ projectId }) {
  const [patches, setPatches] = useState([]);
  const [editing, setEditing] = useState(null); // null | {} | patch
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const confirm = useConfirm();

  async function load() {
    try {
      setPatches(await api(`/patches?projectId=${projectId}`));
    } catch {
      setPatches([]);
    }
  }

  useEffect(() => {
    setMsg('');
    setError('');
    setEditing(null);
    load();
  }, [projectId]);

  async function run(patch, action) {
    setMsg('');
    setError('');
    try {
      await api(`/patches/${patch.id}/${action}`, { method: 'POST', body: {} });
      setMsg(
        `${action === 'apply' ? 'Applied' : 'Reverted'} "${patch.name}" — files changed in place, previous versions saved in dev-hub/backups`,
      );
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(patch) {
    if (!(await confirm(`Delete patch "${patch.name}"? (Files are not touched.)`))) return;
    await api(`/patches/${patch.id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      {editing ? (
        <PatchForm
          projectId={projectId}
          initial={editing.id ? editing : null}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="flex gap-2 items-center flex-wrap my-1.5">
          <span className="text-muted text-[12px]">
            Named file tweaks you apply and revert on demand.
          </span>
          <span className="flex-1" />
          <button className="btn small primary" onClick={() => setEditing({})}>
            + New patch
          </button>
        </div>
      )}

      {msg && <div className="text-green my-1.5">{msg}</div>}
      {error && <div className="text-red my-1.5">{error}</div>}

      {patches.length === 0 && !editing && (
        <div className="text-muted text-[12px]" style={{ padding: '8px 0' }}>
          No patches for this project yet.
        </div>
      )}

      {patches.map((p) => (
        <div className="card compact op-editor" key={p.id}>
          <div className="flex gap-2 items-center flex-wrap my-1.5 justify-between">
            <div className="flex gap-2 items-center flex-wrap my-1.5">
              <strong>{p.name}</strong>
              {statusChip(p.status)}
            </div>
            <div>
              {p.status !== 'applied' && (
                <button className="btn small primary" onClick={() => run(p, 'apply')}>
                  Apply
                </button>
              )}
              {p.status !== 'not-applied' && (
                <button className="btn small" onClick={() => run(p, 'revert')}>
                  Revert
                </button>
              )}
              <button className="btn small" onClick={() => setEditing(p)}>
                Edit
              </button>
              <button className="btn small danger" onClick={() => remove(p)}>
                ✕
              </button>
            </div>
          </div>
          {p.ops.map((op, i) => (
            <div className="service-row" key={i}>
              <span
                className={
                  'dot ' +
                  (p.opStatuses[i] === 'applied'
                    ? 'green'
                    : p.opStatuses[i] === 'not-applied'
                      ? 'gray'
                      : 'orange')
                }
              />
              <span className="font-mono text-[12px]">{opSummary(op)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
