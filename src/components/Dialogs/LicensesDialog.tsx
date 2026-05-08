import React from 'react';

interface LicensesDialogProps {
  onClose: () => void;
}

const LICENSES = [
  { section: 'Rust', libs: [
    { name: 'tauri', license: 'MIT/Apache-2.0', url: 'https://github.com/tauri-apps/tauri' },
    { name: 'cpal', license: 'Apache-2.0', url: 'https://github.com/RustAudio/cpal' },
    { name: 'hound', license: 'Apache-2.0', url: 'https://github.com/ruuda/hound' },
    { name: 'rustfft', license: 'MIT/Apache-2.0', url: 'https://github.com/ejmahler/RustFFT' },
    { name: 'rayon', license: 'MIT/Apache-2.0', url: 'https://github.com/rayon-rs/rayon' },
    { name: 'serde', license: 'MIT/Apache-2.0', url: 'https://github.com/serde-rs/serde' },
    { name: 'serde_json', license: 'MIT/Apache-2.0', url: 'https://github.com/serde-rs/json' },
    { name: 'tokio', license: 'MIT', url: 'https://github.com/tokio-rs/tokio' },
  ]},
  { section: 'Frontend', libs: [
    { name: 'React', license: 'MIT', url: 'https://github.com/facebook/react' },
    { name: 'Zustand', license: 'MIT', url: 'https://github.com/pmndrs/zustand' },
    { name: 'Vite', license: 'MIT', url: 'https://github.com/vitejs/vite' },
    { name: '@tauri-apps/api', license: 'MIT/Apache-2.0', url: 'https://github.com/tauri-apps/tauri' },
    { name: '@tauri-apps/plugin-dialog', license: 'MIT/Apache-2.0', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: '@tauri-apps/plugin-fs', license: 'MIT/Apache-2.0', url: 'https://github.com/tauri-apps/plugins-workspace' },
    { name: '@tauri-apps/plugin-shell', license: 'MIT/Apache-2.0', url: 'https://github.com/tauri-apps/plugins-workspace' },
  ]},
  { section: 'Model', libs: [
    { name: 'RMVPE (Wei et al. 2023)', license: 'MIT', url: 'https://github.com/Dream-High/RMVPE' },
    { name: 'TorchFCPE (CNChTu)', license: 'MIT', url: 'https://github.com/CNChTu/TorchFCPE' },
    { name: 'SOME (openvpi)', license: 'MIT', url: 'https://github.com/openvpi/SOME' },
  ]},
  { section: 'This Project', libs: [
    { name: 'SCRIBE', license: 'Apache-2.0', url: '' },
    { name: 'Parselmouth-Rust (F0)', license: 'Apache-2.0 (original impl)', url: '' },
    { name: 'RMVPE Rust Engine', license: 'Apache-2.0 (original impl)', url: '' },
    { name: 'FCPE Rust Engine', license: 'Apache-2.0 (original impl)', url: '' },
    { name: 'SOME Rust Engine', license: 'Apache-2.0 (original impl)', url: '' },
  ]},
];

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialog: {
    backgroundColor: '#211F1E', borderRadius: '12px', border: '0.5px solid #2A2926',
    width: '500px', maxHeight: '70vh', display: 'flex', flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
  } as React.CSSProperties,
  header: {
    padding: '20px 24px 12px',
    fontSize: '16px', fontWeight: 500, color: '#E8E5DF',
    borderBottom: '0.5px solid #2A2926',
  } as React.CSSProperties,
  body: {
    padding: '16px 24px', overflowY: 'auto', flex: 1,
  } as React.CSSProperties,
  section: {
    fontSize: '11px', fontWeight: 600, color: '#7A7773',
    textTransform: 'uppercase', letterSpacing: '1px',
    marginTop: '16px', marginBottom: '8px',
  } as React.CSSProperties,
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '5px 0', fontSize: '12px',
  } as React.CSSProperties,
  name: { color: '#E8E5DF' } as React.CSSProperties,
  license: { color: '#7A7773', fontSize: '11px' } as React.CSSProperties,
  footer: {
    padding: '12px 24px', borderTop: '0.5px solid #2A2926',
    display: 'flex', justifyContent: 'flex-end',
  } as React.CSSProperties,
  closeBtn: {
    padding: '6px 20px', borderRadius: '5px',
    backgroundColor: 'transparent', border: '0.5px solid #2A2926',
    color: '#A09D96', fontSize: '12px', cursor: 'pointer',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
  } as React.CSSProperties,
};

const LicensesDialog: React.FC<LicensesDialogProps> = ({ onClose }) => {
  return (
    <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.dialog}>
        <div style={s.header}>开源许可</div>
        <div style={s.body as React.CSSProperties}>
          {LICENSES.map((sec) => (
            <div key={sec.section}>
              <div style={s.section}>{sec.section}</div>
              {sec.libs.map((lib) => (
                <div key={lib.name} style={s.row}>
                  <span style={s.name}>{lib.name}</span>
                  <span style={s.license}>{lib.license}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={s.footer}>
          <button style={s.closeBtn} onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default LicensesDialog;
