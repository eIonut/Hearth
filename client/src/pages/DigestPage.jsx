import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function DigestPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/digest?days=${days}`)
      .then(setData)
      .catch(() => {});
  }, [days]);

  async function generateSummary() {
    setError('');
    setLoadingSummary(true);
    try {
      const r = await api('/digest/summary', { method: 'POST', body: { days } });
      setSummary(r.summary);
    } catch (e) {
      setError(e.message);
    }
    setLoadingSummary(false);
  }

  async function copySummary() {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const stats = data
    ? [
        { label: 'TILs logged', value: data.counts.tils },
        { label: 'Learning done', value: data.counts.learningDone },
        { label: 'Added to queue', value: data.counts.learningAdded },
        { label: 'Content drafted', value: data.counts.contentDrafted },
        { label: 'Content posted', value: data.counts.contentPosted },
        { label: 'Snippets saved', value: data.counts.snippetsAdded },
      ]
    : [];

  return (
    <div>
      <div className="row space-between">
        <p className="muted">
          Your last stretch at a glance — and a Claude-written review when you want one.
        </p>
        <div className="row">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ width: 'auto', marginTop: 0 }}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button className="btn primary" onClick={generateSummary} disabled={loadingSummary}>
            {loadingSummary ? 'Writing…' : 'Write my review (Claude)'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((s) => (
          <div className="card stat" key={s.label}>
            <div className="stat-value">{s.value}</div>
            <div className="muted small-text">{s.label}</div>
          </div>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {summary && (
        <div className="card">
          <div className="row space-between">
            <h3>Your review</h3>
            <button className="btn small primary" onClick={copySummary}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="summary-text">{summary}</pre>
        </div>
      )}

      {data && (
        <div className="card">
          <h3>Details</h3>
          {data.tils.length > 0 && (
            <>
              <strong className="small-text">TILs</strong>
              {data.tils.map((t) => (
                <div className="muted small-text" key={t.id}>
                  · {t.text}
                </div>
              ))}
            </>
          )}
          {data.learningDone.length > 0 && (
            <>
              <strong className="small-text">Learning completed</strong>
              {data.learningDone.map((l) => (
                <div className="muted small-text" key={l.id}>
                  · {l.title}
                </div>
              ))}
            </>
          )}
          {data.contentPosted.length > 0 && (
            <>
              <strong className="small-text">Posted</strong>
              {data.contentPosted.map((c) => (
                <div className="muted small-text" key={c.id}>
                  · {c.title}
                </div>
              ))}
            </>
          )}
          {data.tils.length === 0 &&
            data.learningDone.length === 0 &&
            data.contentPosted.length === 0 && (
              <div className="muted">Nothing logged in this period yet.</div>
            )}
        </div>
      )}
    </div>
  );
}
