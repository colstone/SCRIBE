import React, { useState, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

interface ImportDialogProps {
  onImport: (csvPath: string, wavsDir: string, f0Algorithm: string) => void;
  onCancel: () => void;
}

const FONT_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif';

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
    width: '480px',
    padding: '24px',
    fontFamily: FONT_SANS,
  } as React.CSSProperties,

  title: {
    fontSize: '16px',
    fontWeight: 500,
    color: '#E8E5DF',
    margin: 0,
  } as React.CSSProperties,

  formBody: {
    marginTop: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as React.CSSProperties,

  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  } as React.CSSProperties,

  label: {
    fontSize: '12px',
    fontWeight: 400,
    color: '#A09D96',
    width: '80px',
    textAlign: 'right',
    flexShrink: 0,
    fontFamily: FONT_SANS,
  } as React.CSSProperties,

  input: {
    flex: 1,
    height: '32px',
    backgroundColor: '#2A2926',
    border: '0.5px solid #2A2926',
    borderRadius: '5px',
    color: '#E8E5DF',
    fontSize: '12px',
    fontFamily: FONT_SANS,
    padding: '0 10px',
    outline: 'none',
    boxSizing: 'border-box',
  } as React.CSSProperties,

  selectButton: {
    padding: '0 12px',
    height: '32px',
    borderRadius: '5px',
    backgroundColor: '#2A2926',
    border: '0.5px solid #2A2926',
    color: '#A09D96',
    fontSize: '11px',
    fontFamily: FONT_SANS,
    cursor: 'pointer',
    flexShrink: 0,
  } as React.CSSProperties,

  select: {
    flex: 1,
    height: '32px',
    backgroundColor: '#2A2926',
    border: '0.5px solid #2A2926',
    borderRadius: '5px',
    color: '#E8E5DF',
    fontSize: '12px',
    fontFamily: FONT_SANS,
    padding: '0 10px',
    outline: 'none',
    boxSizing: 'border-box',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
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
    fontFamily: FONT_SANS,
    cursor: 'pointer',
  } as React.CSSProperties,

  importButton: {
    padding: '6px 16px',
    borderRadius: '5px',
    backgroundColor: '#6DB0F2',
    border: 'none',
    color: '#FFFFFF',
    fontSize: '12px',
    fontFamily: FONT_SANS,
    cursor: 'pointer',
  } as React.CSSProperties,

  importButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

const ImportDialog: React.FC<ImportDialogProps> = ({ onImport, onCancel }) => {
  const [csvPath, setCsvPath] = useState('');
  const [wavsDir, setWavsDir] = useState('');
  const [f0Algorithm, setF0Algorithm] = useState('parselmouth');

  const canImport = csvPath.trim() !== '' && wavsDir.trim() !== '';

  const handleImport = useCallback(() => {
    if (canImport) {
      onImport(csvPath.trim(), wavsDir.trim(), f0Algorithm);
    }
  }, [canImport, csvPath, wavsDir, f0Algorithm, onImport]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onCancel();
      }
    },
    [onCancel]
  );

  const handleCsvSelect = useCallback(async () => {
    const selected = await open({
      title: '选择 transcriptions.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      multiple: false,
      directory: false,
    });
    if (selected) {
      setCsvPath(selected as string);
    }
  }, []);

  const handleWavsDirSelect = useCallback(async () => {
    const selected = await open({
      title: '选择音频目录',
      multiple: false,
      directory: true,
    });
    if (selected) {
      setWavsDir(selected as string);
    }
  }, []);

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.dialog}>
        <div style={styles.title}>导入数据集</div>
        <div style={styles.formBody}>
          {/* CSV file row */}
          <div style={styles.row}>
            <span style={styles.label}>CSV 文件</span>
            <input
              type="text"
              style={styles.input}
              value={csvPath}
              onChange={(e) => setCsvPath(e.target.value)}
              placeholder="选择 transcriptions.csv"
            />
            <button style={styles.selectButton} onClick={handleCsvSelect}>
              选择
            </button>
          </div>

          {/* Audio directory row */}
          <div style={styles.row}>
            <span style={styles.label}>音频目录</span>
            <input
              type="text"
              style={styles.input}
              value={wavsDir}
              onChange={(e) => setWavsDir(e.target.value)}
              placeholder="选择 wavs 目录"
            />
            <button style={styles.selectButton} onClick={handleWavsDirSelect}>
              选择
            </button>
          </div>

          {/* F0 algorithm row */}
          <div style={styles.row}>
            <span style={styles.label}>F0 算法</span>
            <select
              style={styles.select}
              value={f0Algorithm}
              onChange={(e) => setF0Algorithm(e.target.value)}
            >
              <option value="parselmouth">parselmouth</option>
              <option value="rmvpe">rmvpe</option>
              <option value="fcpe">fcpe</option>
            </select>
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button style={styles.cancelButton} onClick={onCancel}>
            取消
          </button>
          <button
            style={{
              ...styles.importButton,
              ...(!canImport ? styles.importButtonDisabled : {}),
            }}
            onClick={handleImport}
            disabled={!canImport}
          >
            导入
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportDialog;
