import { useState } from 'react';
import { api } from '../../api.js';
import {
  parseServices,
  parseEnvTargets,
  parsePreviews,
  parseLinks,
  serializeServices,
  serializeNamedLines,
} from '../../lib/parsers.js';

export default function ProjectForm({ initial, onSaved, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [path, setPath] = useState(initial?.path || '');
  const [servicesText, setServicesText] = useState(serializeServices(initial?.services));
  const [envText, setEnvText] = useState(
    initial?.envTargets?.length
      ? serializeNamedLines(initial.envTargets, 'file')
      : initial?.envFile
        ? `default: ${initial.envFile}`
        : 'default: .env',
  );
  const [previewsText, setPreviewsText] = useState(serializeNamedLines(initial?.previews, 'url'));
  const [linksText, setLinksText] = useState(serializeNamedLines(initial?.links, 'url'));
  const [error, setError] = useState('');

  async function save() {
    setError('');
    const body = {
      name,
      path,
      services: parseServices(servicesText),
      envTargets: parseEnvTargets(envText),
      previews: parsePreviews(previewsText),
      links: parseLinks(linksText),
    };
    try {
      if (initial?.id) await api(`/projects/${initial.id}`, { method: 'PUT', body });
      else await api('/projects', { method: 'POST', body });
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card form-card">
      <h3>{initial?.id ? 'Edit project' : 'Add project'}</h3>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-app" />
      </label>
      <label>
        Absolute path
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/Users/you/code/my-app"
        />
      </label>
      <label>
        Services (one per line, "name: command" — add * for auto-restart on crash, e.g. "api*: yarn
        start")
        <textarea
          rows={3}
          value={servicesText}
          onChange={(e) => setServicesText(e.target.value)}
          placeholder={'web: yarn dev\napi*: yarn start'}
        />
      </label>
      <label>
        Env files (one per line, "name: relative/path" — one per service if needed)
        <textarea
          rows={3}
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          placeholder={'web: apps/web/.env\napi: apps/api/.env'}
        />
      </label>
      <label>
        Preview URLs (one per line, "service: url" — opens inside the hub)
        <textarea
          rows={2}
          value={previewsText}
          onChange={(e) => setPreviewsText(e.target.value)}
          placeholder={'web: localhost:4000\napi: localhost:5000/docs'}
        />
      </label>
      <label>
        Links (one per line, "name: url" — repo, MRs, pipelines, docs; embeds in the hub when the
        site allows it, otherwise opens a new tab)
        <textarea
          rows={2}
          value={linksText}
          onChange={(e) => setLinksText(e.target.value)}
          placeholder={
            'repo: https://github.com/you/my-app\nMRs: https://gitlab.company.com/team/my-app/-/merge_requests'
          }
        />
      </label>
      {error && <div className="text-red my-1.5">{error}</div>}
      <div className="row">
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
