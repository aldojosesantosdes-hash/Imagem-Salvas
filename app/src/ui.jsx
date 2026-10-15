import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('');
  const t = useRef(0);
  const show = useCallback((m) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(''), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast" role="status" hidden={!msg}>{msg}</div>
    </ToastCtx.Provider>
  );
}

// Botão que pede um segundo toque antes de executar (o app não usa confirm()).
export function ConfirmButton({ children, confirmLabel = 'Toque de novo para confirmar', onConfirm, className = 'btn danger' }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onBlur={() => setArmed(false)}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

export function iniciais(nome) {
  return (
    String(nome || '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || 'C'
  );
}
