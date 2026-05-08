import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

interface BatchPhonemeRenameDialogProps {
  phSeq: string[];
  onConfirm: (renameMap: Record<string, string>) => void;
  onCancel: () => void;
}

interface PhRenamePreset {
  name: string;
  mapping: Record<string, string>;
}

const STORAGE_KEY = 'scribe-ph-rename-presets';
const FONT_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif';
const FONT_MONO = '"Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", monospace';

function loadPresets(): PhRenamePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function savePresets(presets: PhRenamePreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
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
    width: '580px', maxHeight: '85vh', padding: '24px',
    fontFamily: FONT_SANS, display: 'flex', flexDirection: 'column',
  } as React.CSSProperties,
  title: { fontSize: '16px', fontWeight: 500, color: '#E8E5DF', margin: 0 } as React.CSSProperties,
  sectionLabel: { fontSize: '11px', fontWeight: 400, color: '#A09D96', marginBottom: '8px', marginTop: '16px' } as React.CSSProperties,
  presetRow: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' } as React.CSSProperties,
  select: {
    flex: 1, height: '32px', backgroundColor: '#2A2926', border: '0.5px solid #2A2926',
    borderRadius: '5px', color: '#E8E5DF', fontSize: '12px', fontFamily: FONT_SANS,
    padding: '0 10px', outline: 'none', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer',
  } as React.CSSProperties,
  smallBtn: {
    padding: '6px 12px', borderRadius: '5px', backgroundColor: 'transparent',
    border: '0.5px solid #2A2926', color: '#A09D96', fontSize: '11px',
    fontFamily: FONT_SANS, cursor: 'pointer', whiteSpace: 'nowrap',
  } as React.CSSProperties,
  scrollArea: { flex: 1, overflowY: 'auto', marginTop: '12px', maxHeight: '400px' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' } as React.CSSProperties,
  th: {
    fontSize: '10px', fontWeight: 500, color: '#7A7773', textAlign: 'left',
    padding: '6px 8px', borderBottom: '0.5px solid #2A2926',
  } as React.CSSProperties,
  td: { padding: '4px 8px', fontSize: '12px', borderBottom: '0.5px solid rgba(42,41,38,0.5)' } as React.CSSProperties,
  phName: { fontFamily: FONT_MONO, color: '#E8E5DF', fontSize: '11px' } as React.CSSProperties,
  count: { fontFamily: FONT_MONO, color: '#7A7773', fontSize: '11px', textAlign: 'right' } as React.CSSProperties,
  input: {
    width: '100%', height: '26px', backgroundColor: '#1A1918', border: '0.5px solid #2A2926',
    borderRadius: '4px', color: '#E8E5DF', fontSize: '11px', fontFamily: FONT_MONO,
    padding: '0 8px', outline: 'none', boxSizing: 'border-box',
  } as React.CSSProperties,
  inputChanged: { borderColor: 'rgba(86,156,224,0.6)', backgroundColor: 'rgba(86,156,224,0.05)' } as React.CSSProperties,
  statsRow: {
    marginTop: '12px', display: 'flex', gap: '16px', fontSize: '11px',
    color: '#A09D96', fontFamily: FONT_SANS, flexWrap: 'wrap',
  } as React.CSSProperties,
  statValue: { color: '#E8E5DF', fontWeight: 500 } as React.CSSProperties,
  buttonRow: { marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' } as React.CSSProperties,
  cancelBtn: {
    padding: '6px 16px', borderRadius: '5px', backgroundColor: 'transparent',
    border: '0.5px solid #2A2926', color: '#A09D96', fontSize: '12px',
    fontFamily: FONT_SANS, cursor: 'pointer',
  } as React.CSSProperties,
  confirmBtn: {
    padding: '6px 16px', borderRadius: '5px', backgroundColor: '#6DB0F2',
    border: 'none', color: '#FFFFFF', fontSize: '12px',
    fontFamily: FONT_SANS, cursor: 'pointer',
  } as React.CSSProperties,
  saveInput: {
    flex: 1, height: '32px', backgroundColor: '#2A2926', border: '0.5px solid #2A2926',
    borderRadius: '5px', color: '#E8E5DF', fontSize: '12px', fontFamily: FONT_SANS,
    padding: '0 10px', outline: 'none', boxSizing: 'border-box',
  } as React.CSSProperties,
};

const BatchPhonemeRenameDialog: React.FC<BatchPhonemeRenameDialogProps> = ({ phSeq, onConfirm, onCancel }) => {
  const phonemeStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ph of phSeq) {
      counts.set(ph, (counts.get(ph) ?? 0) + 1);
    }
    const entries = Array.from(counts.entries());
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return entries;
  }, [phSeq]);

  const [renameValues, setRenameValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [ph] of phonemeStats) init[ph] = ph;
    return init;
  });

  const [presets, setPresets] = useState<PhRenamePreset[]>(loadPresets);
  const [saveName, setSaveName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');

  const handleInputChange = useCallback((ph: string, value: string) => {
    setRenameValues(prev => ({ ...prev, [ph]: value }));
    setSelectedPreset('');
  }, []);

  const handleLoadPreset = useCallback((name: string) => {
    const preset = presets.find(p => p.name === name);
    if (!preset) return;
    setSelectedPreset(name);
    setRenameValues(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = preset.mapping[key] ?? key;
      }
      return next;
    });
  }, [presets]);

  const handleSavePreset = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;
    const mapping: Record<string, string> = {};
    for (const [ph] of phonemeStats) {
      const newName = renameValues[ph]?.trim();
      if (newName && newName !== ph) mapping[ph] = newName;
    }
    const newPreset: PhRenamePreset = { name, mapping };
    const updated = presets.filter(p => p.name !== name).concat(newPreset);
    setPresets(updated);
    savePresets(updated);
    setSelectedPreset(name);
    setSaveName('');
  }, [saveName, phonemeStats, renameValues, presets]);

  const handleDeletePreset = useCallback(() => {
    if (!selectedPreset) return;
    const updated = presets.filter(p => p.name !== selectedPreset);
    setPresets(updated);
    savePresets(updated);
    setSelectedPreset('');
  }, [selectedPreset, presets]);

  const changedCount = useMemo(() => {
    let count = 0;
    for (const [ph] of phonemeStats) {
      const newName = renameValues[ph]?.trim();
      if (newName && newName !== ph) count++;
    }
    return count;
  }, [phonemeStats, renameValues]);

  const affectedSegments = useMemo(() => {
    const changedPhonemes = new Set<string>();
    for (const [ph] of phonemeStats) {
      const newName = renameValues[ph]?.trim();
      if (newName && newName !== ph) changedPhonemes.add(ph);
    }
    if (changedPhonemes.size === 0) return 0;
    let count = 0;
    for (const [ph, n] of phonemeStats) {
      if (changedPhonemes.has(ph)) count += n;
    }
    return count;
  }, [phonemeStats, renameValues]);

  const handleConfirm = useCallback(() => {
    const map: Record<string, string> = {};
    for (const [ph] of phonemeStats) {
      const newName = renameValues[ph]?.trim();
      if (newName && newName !== ph) map[ph] = newName;
    }
    if (Object.keys(map).length === 0) {
      onCancel();
      return;
    }
    onConfirm(map);
  }, [phonemeStats, renameValues, onConfirm, onCancel]);

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={s.dialog}>
        <div style={s.title}>批量修改音素</div>

        <div style={s.presetRow}>
          <select
            style={s.select}
            value={selectedPreset}
            onChange={e => {
              if (e.target.value) handleLoadPreset(e.target.value);
              else setSelectedPreset('');
            }}
          >
            <option value="">选择预设...</option>
            {presets.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
          {selectedPreset && (
            <button style={s.smallBtn} onClick={handleDeletePreset}>删除</button>
          )}
        </div>

        <div style={s.sectionLabel}>
          音素映射（修改右侧名称，留空或不变则跳过）— 共 {phonemeStats.length} 种音素
        </div>

        <div style={s.scrollArea}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>原音素</th>
                <th style={{ ...s.th, textAlign: 'right' as const }}>出现次数</th>
                <th style={s.th}>新名称</th>
              </tr>
            </thead>
            <tbody>
              {phonemeStats.map(([ph, count]) => {
                const val = renameValues[ph] ?? ph;
                const changed = val.trim() !== '' && val.trim() !== ph;
                return (
                  <tr key={ph}>
                    <td style={{ ...s.td, ...s.phName }}>{ph}</td>
                    <td style={{ ...s.td, ...s.count }}>{count}</td>
                    <td style={s.td}>
                      <input
                        style={{ ...s.input, ...(changed ? s.inputChanged : {}) }}
                        value={val}
                        onChange={e => handleInputChange(ph, e.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ ...s.presetRow, marginTop: '12px' }}>
          <input
            style={s.saveInput as React.CSSProperties}
            placeholder="预设名称..."
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
          />
          <button
            style={{ ...s.smallBtn, ...(saveName.trim() ? { color: '#6DB0F2', borderColor: 'rgba(86,156,224,0.4)' } : { opacity: 0.4 }) }}
            onClick={handleSavePreset}
            disabled={!saveName.trim()}
          >
            保存预设
          </button>
        </div>

        <div style={s.statsRow}>
          <span>修改: <span style={s.statValue}>{changedCount}</span> 个音素</span>
          <span>影响: <span style={s.statValue}>{affectedSegments}</span> 处</span>
        </div>

        <div style={s.buttonRow}>
          <button style={s.cancelBtn} onClick={onCancel}>取消</button>
          <button
            style={{ ...s.confirmBtn, ...(changedCount === 0 ? { opacity: 0.5, cursor: 'default' } : {}) }}
            onClick={handleConfirm}
          >
            确认修改
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchPhonemeRenameDialog;
