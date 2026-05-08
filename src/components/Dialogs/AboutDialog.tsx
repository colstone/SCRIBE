import React, { useState } from 'react';

interface AboutDialogProps {
  onClose: () => void;
}

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialog: {
    backgroundColor: '#211F1E', borderRadius: '12px', border: '0.5px solid #2A2926',
    width: '400px', padding: '32px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
    textAlign: 'center',
  } as React.CSSProperties,
  title: {
    fontSize: '22px', fontWeight: 600, color: '#E8E5DF', margin: 0,
    letterSpacing: '2px',
  } as React.CSSProperties,
  version: {
    fontSize: '12px', color: '#7A7773', marginTop: '6px',
  } as React.CSSProperties,
  desc: {
    fontSize: '12px', color: '#A09D96', marginTop: '16px', lineHeight: 1.6,
  } as React.CSSProperties,
  divider: {
    height: '1px', backgroundColor: '#2A2926', margin: '20px 0',
  } as React.CSSProperties,
  row: {
    fontSize: '11px', color: '#7A7773', lineHeight: 1.8,
  } as React.CSSProperties,
  link: {
    color: '#6DB0F2', textDecoration: 'none', cursor: 'pointer',
  } as React.CSSProperties,
  closeBtn: {
    marginTop: '24px', padding: '6px 24px', borderRadius: '5px',
    backgroundColor: 'transparent', border: '0.5px solid #2A2926',
    color: '#A09D96', fontSize: '12px', cursor: 'pointer',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
  } as React.CSSProperties,
};

const AboutDialog: React.FC<AboutDialogProps> = ({ onClose }) => {
  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.dialog}>
        <div style={s.title}>SCRIBE</div>
        <div style={s.version}>v0.1.0</div>
        <div style={s.desc}>
          DiffSinger variance dataset annotation tool
        </div>
        <div style={s.divider} />
        <div style={s.row}>
          Built with Tauri + React + Rust
        </div>
        <div style={s.row}>
          F0: Parselmouth-Rust / RMVPE / FCPE (INT8-mix)
        </div>
        <div style={s.row}>
          MIDI: SOME (INT8-mix)
        </div>
        <div style={s.row}>
          Audio: cpal
        </div>
        <div style={s.divider} />
        <div style={s.row}>
          UI/UX Design: colstone
        </div>
        <div style={s.divider} />
        <div style={{ ...s.row, color: '#5F5D58' }}>
          Licensed under Apache 2.0
        </div>
        <div style={{ ...s.row, color: '#5F5D58' }}>
          Copyright &copy; 2026 colstone
        </div>
        <button style={s.closeBtn} onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
};

export default AboutDialog;
