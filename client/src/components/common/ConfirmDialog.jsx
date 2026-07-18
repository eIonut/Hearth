import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ConfirmContext = createContext(null);

/**
 * Promise-based confirmation dialog. Wrap the app in <ConfirmProvider> and call
 * the function from useConfirm() wherever you'd otherwise use window.confirm():
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm(`Delete "${name}"?`))) return;
 *
 * A string arg is treated as the message. Pass an object for more control:
 *   confirm({ title, message, confirmText, cancelText, danger })
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { options, resolve } | null
  const resolveRef = useRef(null);

  const confirm = useCallback((opts) => {
    const options = typeof opts === 'string' ? { message: opts } : opts || {};
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ options });
    });
  }, []);

  const close = useCallback((result) => {
    if (resolveRef.current) resolveRef.current(result);
    resolveRef.current = null;
    setState(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && <ConfirmModal options={state.options} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmModal({ options, onClose }) {
  const {
    title = 'Are you sure?',
    message = '',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    danger = true,
  } = options;
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape') onClose(false);
      else if (e.key === 'Enter') onClose(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="animate-modal-fade fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(1,4,9,0.7)] p-5"
      onClick={() => onClose(false)}
    >
      <div
        className="animate-modal-pop w-full max-w-[420px] rounded-[10px] border border-border bg-bg-2 p-5 shadow-[0_12px_40px_rgba(1,4,9,0.6)]"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mt-0 mb-2 text-[16px]">{title}</h3>
        {message && <p className="mb-4 text-[13px] leading-[1.5] text-muted">{message}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button className="btn ml-0" onClick={() => onClose(false)}>
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            className={'btn ml-0 ' + (danger ? 'danger-solid' : 'primary')}
            onClick={() => onClose(true)}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + hook colocated; splitting is Phase 4 work
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used within a ConfirmProvider');
  return confirm;
}
