import React, { useCallback } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,

  dialog: {
    backgroundColor: '#211F1E',
    borderRadius: '12px',
    border: '0.5px solid #2A2926',
    minWidth: '360px',
    padding: '24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
  } as React.CSSProperties,

  title: {
    fontSize: '16px',
    fontWeight: 500,
    color: '#E8E5DF',
    margin: 0,
  } as React.CSSProperties,

  message: {
    fontSize: '12px',
    fontWeight: 400,
    color: '#A09D96',
    marginTop: '12px',
    lineHeight: 1.5,
  } as React.CSSProperties,

  buttonRow: {
    marginTop: '20px',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  } as React.CSSProperties,

  cancelButton: {
    padding: '6px 16px',
    borderRadius: '5px',
    backgroundColor: 'transparent',
    border: '0.5px solid #2A2926',
    color: '#A09D96',
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,

  confirmButton: {
    padding: '6px 16px',
    borderRadius: '5px',
    backgroundColor: '#6DB0F2',
    border: 'none',
    color: '#FFFFFF',
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,

  dangerButton: {
    backgroundColor: '#E24B4A',
  } as React.CSSProperties,
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
  danger = false,
}) => {
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onCancel();
      }
    },
    [onCancel]
  );

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.dialog}>
        <div style={styles.title}>{title}</div>
        <div style={styles.message}>{message}</div>
        <div style={styles.buttonRow}>
          <button style={styles.cancelButton} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            style={{
              ...styles.confirmButton,
              ...(danger ? styles.dangerButton : {}),
            }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
