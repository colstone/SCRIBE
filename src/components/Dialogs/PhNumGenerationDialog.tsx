import React, { useState, useCallback, useMemo, useEffect } from 'react';
import PhonemeClassifier from './PhonemeClassifier';
import PhNumPreview from './PhNumPreview';
import { inferPhNum } from '../../engine/phNumInfer';

interface Preset {
  name: string;
  language: string;
  vowels: string[];
}

interface PhNumGenerationDialogProps {
  phSeq: string[];
  presets: Preset[];
  onConfirm: (vowelList: string[], presetName: string | null) => void;
  onCancel: () => void;
}

const STORAGE_KEY = 'scribe-custom-presets';

function loadCustomPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveCustomPresets(presets: Preset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
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
    width: '560px',
    padding: '24px',
    fontFamily: FONT_SANS,
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
  } as React.CSSProperties,

  title: {
    fontSize: '16px',
    fontWeight: 500,
    color: '#E8E5DF',
    margin: 0,
  } as React.CSSProperties,

  section: {
    marginTop: '16px',
  } as React.CSSProperties,

  sectionLabel: {
    fontSize: '11px',
    fontWeight: 400,
    color: '#A09D96',
    marginBottom: '8px',
  } as React.CSSProperties,

  select: {
    width: '100%',
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

  input: {
    width: '100%',
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

  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    marginTop: '16px',
  } as React.CSSProperties,

  statsRow: {
    marginTop: '12px',
    display: 'flex',
    gap: '16px',
    fontSize: '11px',
    color: '#A09D96',
    fontFamily: FONT_SANS,
    flexWrap: 'wrap',
  } as React.CSSProperties,

  statValue: {
    color: '#E8E5DF',
    fontWeight: 500,
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

  confirmButton: {
    padding: '6px 16px',
    borderRadius: '5px',
    backgroundColor: '#6DB0F2',
    border: 'none',
    color: '#FFFFFF',
    fontSize: '12px',
    fontFamily: FONT_SANS,
    cursor: 'pointer',
  } as React.CSSProperties,

  saveButton: {
    padding: '6px 16px',
    borderRadius: '5px',
    backgroundColor: 'transparent',
    border: '0.5px solid rgba(86,156,224,0.4)',
    color: '#6DB0F2',
    fontSize: '12px',
    fontFamily: FONT_SANS,
    cursor: 'pointer',
  } as React.CSSProperties,
};

const CUSTOM_OPTION = '__custom__';

const PhNumGenerationDialog: React.FC<PhNumGenerationDialogProps> = ({
  phSeq,
  presets,
  onConfirm,
  onCancel,
}) => {
  const [customPresets, setCustomPresets] = useState<Preset[]>(loadCustomPresets);
  const allPresets = useMemo(() => [...presets, ...customPresets], [presets, customPresets]);

  const [selectedPreset, setSelectedPreset] = useState<string>(
    allPresets.length > 0 ? allPresets[0].name : CUSTOM_OPTION
  );
  const [customVowels, setCustomVowels] = useState<string[]>(
    allPresets.length > 0 ? allPresets[0].vowels : []
  );
  const [customName, setCustomName] = useState('');

  const isCustom = selectedPreset === CUSTOM_OPTION;

  const currentVowels = useMemo(() => {
    if (isCustom) return customVowels;
    const preset = allPresets.find((p) => p.name === selectedPreset);
    return preset ? preset.vowels : customVowels;
  }, [selectedPreset, allPresets, customVowels, isCustom]);

  const previewPhSeq = useMemo(() => {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const ph of phSeq) {
      if (!seen.has(ph)) {
        seen.add(ph);
        unique.push(ph);
      }
    }
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }, [phSeq]);

  const samplePhSeq = useMemo(() => phSeq.slice(0, 200), [phSeq]);
  const phNum = useMemo(() => inferPhNum(samplePhSeq, currentVowels), [samplePhSeq, currentVowels]);

  const warnings = useMemo(() => {
    const result: string[] = [];
    let phIdx = 0;
    const vowelSet = new Set([...currentVowels, 'AP', 'SP']);
    for (let gi = 0; gi < phNum.length; gi++) {
      const count = phNum[gi];
      const groupPhonemes = samplePhSeq.slice(phIdx, phIdx + count);
      const hasVowel = groupPhonemes.some((ph) => vowelSet.has(ph));
      if (!hasVowel && groupPhonemes.length > 0) {
        result.push(`词组 ${gi + 1} (${groupPhonemes.join(' ')}) 无元音`);
      }
      if (count > 6) {
        result.push(`词组 ${gi + 1} 包含 ${count} 个音素，可能过长`);
      }
      phIdx += count;
    }
    return result;
  }, [samplePhSeq, phNum, currentVowels]);

  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setSelectedPreset(value);
      if (value !== CUSTOM_OPTION) {
        const preset = [...presets, ...customPresets].find((p) => p.name === value);
        if (preset) {
          setCustomVowels(preset.vowels);
        }
      }
    },
    [presets, customPresets]
  );

  const handleVowelsChange = useCallback((newVowels: string[]) => {
    setCustomVowels(newVowels);
    setSelectedPreset(CUSTOM_OPTION);
  }, []);

  const handleSaveCustom = useCallback(() => {
    const name = customName.trim();
    if (!name) return;
    const newPreset: Preset = { name, language: '自定义', vowels: [...customVowels] };
    const updated = customPresets.filter((p) => p.name !== name).concat(newPreset);
    setCustomPresets(updated);
    saveCustomPresets(updated);
    setSelectedPreset(name);
  }, [customName, customVowels, customPresets]);

  const handleConfirm = useCallback(() => {
    const presetName = isCustom ? null : selectedPreset;
    onConfirm(currentVowels, presetName);
  }, [isCustom, selectedPreset, currentVowels, onConfirm]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel]
  );

  const groupedBuiltin = useMemo(() => {
    const map = new Map<string, Preset[]>();
    for (const p of presets) {
      const list = map.get(p.language) ?? [];
      list.push(p);
      map.set(p.language, list);
    }
    return map;
  }, [presets]);

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.dialog}>
        <div style={styles.title}>生成词组划分（ph_num）</div>

        <div style={styles.section}>
          <div style={styles.sectionLabel}>方案</div>
          <select style={styles.select} value={selectedPreset} onChange={handlePresetChange}>
            {Array.from(groupedBuiltin.entries()).map(([lang, items]) => (
              <optgroup key={lang} label={lang}>
                {items.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </optgroup>
            ))}
            {customPresets.length > 0 && (
              <optgroup label="自定义方案">
                {customPresets.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </optgroup>
            )}
            <option value={CUSTOM_OPTION}>新建自定义...</option>
          </select>
        </div>

        <div style={styles.scrollArea}>
          <div style={styles.section}>
            <div style={styles.sectionLabel}>
              音素分类（点击切换元音/辅音）— 共 {previewPhSeq.length} 种音素
            </div>
            <PhonemeClassifier
              phonemes={previewPhSeq}
              vowels={currentVowels}
              onVowelsChange={handleVowelsChange}
            />
          </div>

          {isCustom && (
            <div style={{ ...styles.section, display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                style={styles.input as React.CSSProperties}
                placeholder="方案名称..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
              <button
                style={{
                  ...styles.saveButton,
                  opacity: customName.trim() ? 1 : 0.4,
                  cursor: customName.trim() ? 'pointer' : 'default',
                }}
                onClick={handleSaveCustom}
                disabled={!customName.trim()}
              >
                保存
              </button>
            </div>
          )}

          <div style={styles.section}>
            <div style={styles.sectionLabel}>分组预览（前 200 个音素）</div>
            <PhNumPreview phSeq={samplePhSeq} phNum={phNum} warnings={warnings} />
          </div>
        </div>

        <div style={styles.statsRow}>
          <span>词组数: <span style={styles.statValue}>{phNum.length}</span></span>
          <span>音素数: <span style={styles.statValue}>{samplePhSeq.length}</span></span>
          <span>元音数: <span style={styles.statValue}>{currentVowels.length}</span></span>
          {warnings.length > 0 && (
            <span style={{ color: '#EF9F27' }}>{warnings.length} 个警告</span>
          )}
        </div>

        <div style={styles.buttonRow}>
          <button style={styles.cancelButton} onClick={onCancel}>取消</button>
          <button style={styles.confirmButton} onClick={handleConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
};

export default PhNumGenerationDialog;
