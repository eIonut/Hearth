import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { openPreview } from '../../lib/bus.js';

// cache embeddability checks across renders (url -> true/false)
const embedCache = {};

export default function LinkButton({ project, link }) {
  const [embeddable, setEmbeddable] = useState(embedCache[link.url] ?? null);

  useEffect(() => {
    if (embedCache[link.url] !== undefined) return;
    api(`/preview/check?url=${encodeURIComponent(link.url)}`)
      .then((r) => {
        embedCache[link.url] = r.reachable && !r.blocked;
        setEmbeddable(embedCache[link.url]);
      })
      .catch(() => {
        embedCache[link.url] = false;
        setEmbeddable(false);
      });
  }, [link.url]);

  if (embeddable) {
    return (
      <button
        className="btn small"
        onClick={() => openPreview(`${project.name}/${link.name}`, link.url)}
      >
        {link.name}
      </button>
    );
  }
  return (
    <a className="btn small" href={link.url} target="_blank" rel="noreferrer" title={link.url}>
      {link.name} ↗
    </a>
  );
}
