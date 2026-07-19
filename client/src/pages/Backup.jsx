import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useConfirm } from '../components/common/ConfirmDialog.jsx';

function when(iso) {
  return iso ? new Date(iso).toLocaleString() : 'never';
}

// A flash line that clears itself, so success/error messages don't linger.
function useFlash() {
  const [msg, setMsg] = useState(null); // { kind: 'ok'|'err', text }
  return [msg, (kind, text) => setMsg({ kind, text }), () => setMsg(null)];
}

function Flash({ msg }) {
  if (!msg) return null;
  return (
    <div className={msg.kind === 'ok' ? 'my-1.5 text-green' : 'my-1.5 text-red'}>{msg.text}</div>
  );
}

// Renders the secret-scan findings the server returns (either from the preview
// scan or when a push is blocked by the gate).
function Findings({ findings }) {
  if (!findings?.length) return null;
  return (
    <div className="mt-2 rounded-md border border-border bg-bg p-2.5 text-[13px]">
      <div className="mb-1 font-semibold text-red">
        {findings.length} possible secret{findings.length > 1 ? 's' : ''} found:
      </div>
      {findings.map((f, i) => (
        <div key={i} className="font-mono text-[12px] text-muted">
          {f.file}.json:{f.line} — {f.reason}: {f.preview}
        </div>
      ))}
    </div>
  );
}

// Per-destination auto-sync toggle plus the outcome of the last automatic run,
// so the user can see it's working (or paused on a secret).
function AutoRow({ checked, onChange, state }) {
  const tone = state?.status === 'error' || state?.status === 'blocked' ? 'text-red' : 'text-muted';
  return (
    <div className="my-1.5 flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          style={{ width: 'auto', margin: 0 }}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>Auto-sync on change</span>
      </label>
      {state && (
        <span className={`text-[12px] ${tone}`}>
          last auto: {state.status} ({state.detail}) · {when(state.at)}
        </span>
      )}
    </div>
  );
}

export default function Backup() {
  const [status, setStatus] = useState(null);
  const [enabled, setEnabled] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [cloudDir, setCloudDir] = useState('');
  const [gitRemote, setGitRemote] = useState('');
  const [findings, setFindings] = useState([]);
  const confirm = useConfirm();

  const [cfgFlash, setCfgFlash] = useFlash();
  const [cloudFlash, setCloudFlash] = useFlash();
  const [gitFlash, setGitFlash] = useFlash();

  async function load() {
    const s = await api('/sync/status');
    setStatus(s);
    setEnabled(s.config.enabled);
    setCloudDir(s.config.cloud.dir);
    setGitRemote(s.config.git.remote);
  }

  useEffect(() => {
    load();
    api('/sync/detect').then((r) => setCandidates(r.candidates));
  }, []);

  if (!status) return <div className="text-muted">Loading…</div>;

  function toggle(name) {
    setEnabled((e) => (e.includes(name) ? e.filter((n) => n !== name) : [...e, name]));
  }

  async function saveFiles() {
    try {
      await api('/sync/config', { method: 'PUT', body: { enabled } });
      setCfgFlash('ok', 'Saved.');
      load();
    } catch (e) {
      setCfgFlash('err', e.message);
    }
  }

  async function reviewSecrets() {
    const r = await api('/sync/scan');
    setFindings(r.findings);
    if (r.findings.length === 0) setCfgFlash('ok', 'No secrets detected in the selected data.');
  }

  // Shared push handler for both destinations. On a secret-gate block it shows
  // the findings and asks for an explicit override, then retries with force.
  async function doPush(endpoint, setFlash) {
    setFindings([]);
    try {
      const r = await api(endpoint, { method: 'POST', body: {} });
      setFlash('ok', `Synced ${r.files.length} files at ${when(r.exportedAt)}.`);
      load();
    } catch (e) {
      if (e.data?.findings) {
        setFindings(e.data.findings);
        const ok = await confirm(
          `${e.data.findings.length} possible secret(s) found in your data. Sync anyway?`,
        );
        if (!ok) return setFlash('err', 'Sync cancelled — secrets left on this machine.');
        try {
          const r = await api(endpoint, { method: 'POST', body: { force: true } });
          setFlash('ok', `Synced ${r.files.length} files (override) at ${when(r.exportedAt)}.`);
          load();
        } catch (e2) {
          setFlash('err', e2.message);
        }
      } else {
        setFlash('err', e.message);
      }
    }
  }

  async function saveAuto(body, setFlash) {
    try {
      await api('/sync/config', { method: 'PUT', body });
      load();
    } catch (e) {
      setFlash('err', e.message);
    }
  }

  async function doRestore(endpoint, setFlash) {
    const ok = await confirm(
      'Restore overwrites your current local data with the backup. Your current data is snapshotted to backups/ first. Continue?',
    );
    if (!ok) return;
    try {
      const r = await api(endpoint, { method: 'POST', body: {} });
      setFlash('ok', `Restored ${r.restored.length} files. Previous data saved to ${r.snapshot}.`);
      load();
    } catch (e) {
      setFlash('err', e.message);
    }
  }

  const cloud = status.cloud || {};
  const git = status.git || {};

  return (
    <div className="max-w-[1100px] p-6">
      <h2 className="mb-2">Backup</h2>
      <p className="text-muted">
        Your snippets, notes, learnings and workflows live in this folder and are gitignored — so
        they don't ship with the app repo. Point them at a backup destination you own so years of
        work survive a lost laptop or a fresh clone.
      </p>

      {/* --- what to sync --------------------------------------------------- */}
      <div className="card">
        <h3>What to back up</h3>
        <div className="text-[12px] text-muted">
          Env presets, backups and local settings are never included — they can hold secrets or
          machine-specific paths.
        </div>
        <div className="my-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {status.eligible.map((name) => (
            <label key={name} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                style={{ width: 'auto', margin: 0 }}
                checked={enabled.includes(name)}
                onChange={() => toggle(name)}
              />
              <span>{name}</span>
              {name === 'projects' && <span className="text-[11px] text-muted">(local paths)</span>}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn primary" onClick={saveFiles}>
            Save selection
          </button>
          <button className="btn" onClick={reviewSecrets}>
            Scan for secrets{status.secretCount ? ` (${status.secretCount})` : ''}
          </button>
        </div>
        <Flash msg={cfgFlash} />
        <Findings findings={findings} />
      </div>

      {/* --- cloud folder --------------------------------------------------- */}
      <div className="card">
        <h3>Cloud folder — effortless, off-machine</h3>
        <div className="text-[12px] text-muted">
          Write a backup into a folder your OS already syncs (iCloud, Dropbox, OneDrive, Drive). No
          accounts, no git. A mirror, not version history.
        </div>
        {candidates.length > 0 && (
          <div className="my-2 flex flex-wrap gap-2">
            {candidates.map((c) => (
              <button
                key={c.dir}
                className="btn small"
                onClick={() => setCloudDir(c.dir)}
                title={c.dir}
              >
                Use {c.provider}
              </button>
            ))}
          </div>
        )}
        <div className="my-1.5 flex flex-wrap items-center gap-2">
          <input
            value={cloudDir}
            onChange={(e) => setCloudDir(e.target.value)}
            placeholder="~/Library/Mobile Documents/com~apple~CloudDocs"
            style={{ flex: 1, minWidth: 260 }}
          />
          <button
            className="btn"
            onClick={async () => {
              try {
                await api('/sync/config', { method: 'PUT', body: { cloudDir } });
                setCloudFlash('ok', 'Folder saved.');
                load();
              } catch (e) {
                setCloudFlash('err', e.message);
              }
            }}
          >
            Save folder
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn primary"
            disabled={!status.config.cloud.dir}
            onClick={() => doPush('/sync/cloud/push', setCloudFlash)}
          >
            Back up now
          </button>
          <button
            className="btn"
            disabled={!cloud.exists}
            onClick={() => doRestore('/sync/cloud/restore', setCloudFlash)}
          >
            Restore
          </button>
          <span className="text-[12px] text-muted">
            Last backup: {when(status.config.lastCloudAt)}
          </span>
        </div>
        <AutoRow
          checked={status.config.auto.cloud}
          onChange={(v) => saveAuto({ autoCloud: v }, setCloudFlash)}
          state={status.config.autoState?.cloud}
        />
        {cloud.conflicts?.length > 0 && (
          <div className="my-1.5 text-red">
            ⚠ {cloud.conflicts.length} conflicted-copy file(s) in the cloud folder — two machines
            may have written at once. Review them: {cloud.conflicts.join(', ')}
          </div>
        )}
        <Flash msg={cloudFlash} />
      </div>

      {/* --- git remote ----------------------------------------------------- */}
      <div className="card">
        <h3>Git remote — versioned, multi-machine</h3>
        <div className="text-[12px] text-muted">
          Push to a <span className="font-semibold">private</span> repo you own (not a fork of the
          app). Full history and diffs. Needs your SSH key or credential helper already set up.
        </div>
        <div className="my-1.5 flex flex-wrap items-center gap-2">
          <input
            value={gitRemote}
            onChange={(e) => setGitRemote(e.target.value)}
            placeholder="git@github.com:you/dev-hub-data.git"
            style={{ flex: 1, minWidth: 260 }}
          />
          <button
            className="btn"
            onClick={async () => {
              try {
                await api('/sync/git/init', { method: 'POST', body: { remote: gitRemote } });
                setGitFlash('ok', 'Repo initialized and remote connected.');
                load();
              } catch (e) {
                setGitFlash('err', e.message);
              }
            }}
          >
            Connect
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn primary"
            disabled={!git.initialized}
            onClick={() => doPush('/sync/git/push', setGitFlash)}
          >
            Commit &amp; push
          </button>
          <button
            className="btn"
            disabled={!status.config.git.remote}
            onClick={() => doRestore('/sync/git/restore', setGitFlash)}
          >
            Restore from remote
          </button>
          {git.lastCommit && (
            <span className="text-[12px] text-muted">
              Last commit {git.lastCommit.hash} · {when(git.lastCommit.when)}
            </span>
          )}
        </div>
        <AutoRow
          checked={status.config.auto.git}
          onChange={(v) => saveAuto({ autoGit: v }, setGitFlash)}
          state={status.config.autoState?.git}
        />
        <Flash msg={gitFlash} />
      </div>
    </div>
  );
}
