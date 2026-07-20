const FILE_STATUS_LABELS = {
  modified: 'Modified',
  added: 'Added',
  deleted: 'Deleted',
  renamed: 'Renamed',
  copied: 'Copied',
  untracked: 'New',
  conflicted: 'Conflict',
};

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function syncMessage(status) {
  const parts = [];
  if (status.ahead) parts.push(`${plural(status.ahead, 'commit')} to push`);
  if (status.behind) parts.push(`${plural(status.behind, 'commit')} to pull`);
  if (parts.length) return parts.join(' · ');
  return status.upstream ? 'Up to date' : 'No remote branch connected';
}

export default function GitStatus({ status }) {
  if (!status) {
    return <div className="mt-3 border-t border-border pt-3 text-muted">Checking Git status…</div>;
  }

  if (status.state !== 'repository') {
    const message =
      status.state === 'not-repository'
        ? 'This folder is not a Git project yet — Hearth will still work normally.'
        : status.state === 'git-unavailable'
          ? 'Git is not available on this computer, so branch and file changes cannot be shown.'
          : 'Git status is unavailable for this folder right now.';
    return (
      <div className="mt-3 border-t border-border pt-3 text-muted">
        <span className="font-semibold text-text">Git</span>
        <span> · {message}</span>
      </div>
    );
  }

  const visibleFiles = status.changedFiles.slice(0, 20);
  const remainingFiles = status.changedFileCount - visibleFiles.length;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold">Git</span>
        <span className="font-mono text-accent">{status.branch}</span>
        <span className="text-muted">· {syncMessage(status)}</span>
        <span className={status.changedFileCount ? 'text-orange' : 'text-green'}>
          ·{' '}
          {status.changedFileCount
            ? plural(status.changedFileCount, 'changed file')
            : 'No changed files'}
        </span>
      </div>

      {status.changedFileCount > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-muted hover:text-text">
            Show changed files
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {visibleFiles.map((file) => (
              <li key={`${file.status}:${file.path}`} className="flex items-start gap-2">
                <span className="w-14 shrink-0 text-muted">{FILE_STATUS_LABELS[file.status]}</span>
                <span className="break-all">{file.path}</span>
              </li>
            ))}
          </ul>
          {remainingFiles > 0 && (
            <div className="mt-1 text-muted">…and {plural(remainingFiles, 'more file')}</div>
          )}
        </details>
      )}
    </div>
  );
}
