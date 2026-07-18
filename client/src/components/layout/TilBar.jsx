import { useState } from 'react';
import { api } from '../../api.js';

// "Today I Learned" quick-capture bar pinned to the top of every page.
export default function TilBar() {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!text.trim()) return;
    await api('/tils', { method: 'POST', body: { text } });
    setText('');
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-bg-2 px-6 py-2">
      <span className="text-[12px] font-bold text-accent">TIL</span>
      <input
        className="mt-0 max-w-[520px]"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
        }}
        placeholder="What did you just learn? Log it in 3 seconds…"
      />
      <button className="btn primary small" onClick={save} disabled={!text.trim()}>
        {saved ? 'Logged ✓' : 'Log'}
      </button>
    </div>
  );
}
