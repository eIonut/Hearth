import { Play, Loader2 } from 'lucide-react';

// The row of one-click workflow buttons shown above the project grid.
export default function WorkflowQuickRun({ workflows, running, onRun }) {
  return workflows.map((wf) => (
    <button
      key={wf.id}
      className="btn small"
      disabled={running[wf.id]}
      onClick={() => onRun(wf)}
      title={wf.stepLabels.join(' → ')}
    >
      {running[wf.id] ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
      {wf.name}
    </button>
  ));
}
