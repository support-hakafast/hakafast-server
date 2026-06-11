import React, {
  createContext, useCallback, useContext, useMemo, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from './LanguageContext.jsx';
import '../assets/AppDialog.css';

const DialogContext = createContext(null);

function AppDialogView({
  dialog, onClose, t,
}) {
  if (!dialog) return null;

  const {
    type, message, title, variant, confirmLabel, cancelLabel, resolve,
  } = dialog;

  const handleClose = (result) => {
    resolve(result);
    onClose();
  };

  const icon = type === 'confirm'
    ? (variant === 'danger' ? '⚠️' : variant === 'warning' ? '❓' : '💬')
    : variant === 'success' ? '✓' : variant === 'error' ? '✕' : 'ℹ️';

  return (
    <div
      className="hf-dialog-overlay"
      role="presentation"
      onClick={() => type === 'alert' && handleClose(true)}
    >
      <div
        className={`hf-dialog hf-dialog-${type}${variant ? ` hf-dialog-${variant}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hf-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hf-dialog-icon" aria-hidden>{icon}</div>
        {title ? <h2 id="hf-dialog-title" className="hf-dialog-title">{title}</h2> : null}
        <p className="hf-dialog-message">{message}</p>
        <div className="hf-dialog-actions">
          {type === 'confirm' ? (
            <>
              <button
                type="button"
                className="hf-dialog-btn hf-dialog-btn-cancel"
                onClick={() => handleClose(false)}
              >
                {cancelLabel || t('modal_cancel')}
              </button>
              <button
                type="button"
                className={`hf-dialog-btn hf-dialog-btn-confirm${variant === 'danger' ? ' is-danger' : ''}`}
                onClick={() => handleClose(true)}
                autoFocus
              >
                {confirmLabel || t('modal_confirm')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="hf-dialog-btn hf-dialog-btn-confirm"
              onClick={() => handleClose(true)}
              autoFocus
            >
              {confirmLabel || t('modal_ok')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DialogProvider({ children }) {
  const { t } = useLanguage();
  const [dialog, setDialog] = useState(null);

  const closeDialog = useCallback(() => setDialog(null), []);

  const showAlert = useCallback((message, options = {}) => new Promise((resolve) => {
    setDialog({
      type: 'alert',
      message,
      title: options.title || null,
      variant: options.variant || 'info',
      confirmLabel: options.confirmLabel || null,
      resolve,
    });
  }), []);

  const showConfirm = useCallback((message, options = {}) => new Promise((resolve) => {
    setDialog({
      type: 'confirm',
      message,
      title: options.title || null,
      variant: options.variant || 'warning',
      confirmLabel: options.confirmLabel || null,
      cancelLabel: options.cancelLabel || null,
      resolve,
    });
  }), []);

  const showConfirmTwice = useCallback(async (msg1, msg2, options = {}) => {
    const ok1 = await showConfirm(msg1, { ...options, variant: options.variant || 'warning' });
    if (!ok1) return false;
    return showConfirm(msg2, { ...options, variant: 'danger' });
  }, [showConfirm]);

  const value = useMemo(() => ({
    showAlert, showConfirm, showConfirmTwice,
  }), [showAlert, showConfirm, showConfirmTwice]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog && createPortal(
        <AppDialogView dialog={dialog} onClose={closeDialog} t={t} />,
        document.body,
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}
