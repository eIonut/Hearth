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
    <div className="modal-overlay" onClick={() => onClose(false)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{title}</h3>
        {message && <p className="modal-message">{message}</p>}
        <div className="flex gap-2 items-center flex-wrap my-1.5 justify-between modal-actions">
          <button className="btn" onClick={() => onClose(false)}>
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            className={'btn ' + (danger ? 'danger-solid' : 'primary')}
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
