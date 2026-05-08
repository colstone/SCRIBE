import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import PhonemeContextMenu from '../ContextMenus/PhonemeContextMenu';
import { useProjectStore } from '../../stores/projectStore';

// ============================================================================
// PhonemeTrack
// ============================================================================

interface PhonemeTrackProps {
  phSeq: readonly string[];
  phDur: readonly number[];
  scrollX: number;
  pixelsPerSecond: number;
}

const HEIGHT = 36;
const LABEL_WIDTH = 48;
const MONO_FONT = '"Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", monospace';
const SANS_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif';

const styles = {
  container: {
    height: `${HEIGHT}px`,
    backgroundColor: '#1A1918',
    display: 'flex',
    flexDirection: 'row',
    flexShrink: 0,
    overflow: 'hidden',
  } as React.CSSProperties,

  label: {
    width: `${LABEL_WIDTH}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 500,
    color: '#A09D96',
    fontFamily: SANS_FONT,
    flexShrink: 0,
    userSelect: 'none',
  } as React.CSSProperties,

  content: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  } as React.CSSProperties,

  phonemeContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    display: 'flex',
    flexDirection: 'row',
  } as React.CSSProperties,
};

// --- Inline phoneme rename dialog ---

interface RenameDialogProps {
  phoneme: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

const dialogStyles = {
  overlay: {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialog: {
    backgroundColor: '#211F1E', borderRadius: '12px', border: '0.5px solid #2A2926',
    minWidth: '320px', padding: '24px',
    fontFamily: SANS_FONT,
  } as React.CSSProperties,
  title: { fontSize: '16px', fontWeight: 500, color: '#E8E5DF', margin: 0 } as React.CSSProperties,
  input: {
    marginTop: '16px', width: '100%', boxSizing: 'border-box',
    padding: '8px 12px', borderRadius: '6px',
    backgroundColor: '#1A1918', border: '0.5px solid #2A2926',
    color: '#E8E5DF', fontSize: '13px', fontFamily: MONO_FONT,
    outline: 'none',
  } as React.CSSProperties,
  buttonRow: { marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' } as React.CSSProperties,
  cancelBtn: {
    padding: '6px 16px', borderRadius: '5px', backgroundColor: 'transparent',
    border: '0.5px solid #2A2926', color: '#A09D96', fontSize: '12px',
    fontFamily: SANS_FONT, cursor: 'pointer',
  } as React.CSSProperties,
  confirmBtn: {
    padding: '6px 16px', borderRadius: '5px', backgroundColor: '#6DB0F2',
    border: 'none', color: '#FFFFFF', fontSize: '12px',
    fontFamily: SANS_FONT, cursor: 'pointer',
  } as React.CSSProperties,
};

const RenameDialog: React.FC<RenameDialogProps> = ({ phoneme, onConfirm, onCancel }) => {
  const [value, setValue] = useState(phoneme);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const trimmed = value.trim();
      if (trimmed && trimmed !== phoneme) onConfirm(trimmed);
      else onCancel();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div style={dialogStyles.overlay} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={dialogStyles.dialog}>
        <div style={dialogStyles.title}>修改音素标签</div>
        <input
          ref={inputRef}
          style={dialogStyles.input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={phoneme}
        />
        <div style={dialogStyles.buttonRow}>
          <button style={dialogStyles.cancelBtn} onClick={onCancel}>取消</button>
          <button
            style={{
              ...dialogStyles.confirmBtn,
              ...((!value.trim() || value.trim() === phoneme) ? { opacity: 0.5, cursor: 'default' } : {}),
            }}
            onClick={() => {
              const trimmed = value.trim();
              if (trimmed && trimmed !== phoneme) onConfirm(trimmed);
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

const PhonemeTrack: React.FC<PhonemeTrackProps> = ({
  phSeq,
  phDur,
  scrollX,
  pixelsPerSecond,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [renameIndex, setRenameIndex] = useState<number | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, index });
  }, []);

  const handleRenamePhoneme = useCallback((newName: string) => {
    if (renameIndex === null) return;
    const store = useProjectStore.getState();
    const idx = store.currentSegmentIndex;
    const segment = store.getCurrentSegment();
    if (!segment) return;

    const newPhSeq = [...segment.data.phSeq];
    newPhSeq[renameIndex] = newName;
    store.updateSegmentData(idx, { phSeq: newPhSeq });
    setRenameIndex(null);
  }, [renameIndex]);

  const phonemes = useMemo(() => {
    const result: React.ReactNode[] = [];
    let timePos = 0;

    for (let i = 0; i < phSeq.length; i++) {
      const ph = phSeq[i];
      const dur = phDur[i] ?? 0;
      const x = (timePos - scrollX) * pixelsPerSecond;
      const w = dur * pixelsPerSecond;

      timePos += dur;

      if (x + w < 0) continue;

      const isSilent = ph === 'SP' || ph === 'AP';
      const showBorder = w >= 2;

      const phStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${x}px`,
        top: 0,
        width: `${Math.max(0, w)}px`,
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        borderRight: showBorder ? '0.5px solid #2A2926' : 'none',
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: '0 2px',
      };

      const textStyle: React.CSSProperties = {
        fontSize: isSilent ? '9px' : '10px',
        fontFamily: MONO_FONT,
        color: isSilent ? '#5F5D58' : '#A09D96',
        fontStyle: isSilent ? 'italic' : 'normal',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        width: '100%',
        textAlign: 'center',
      };

      result.push(
        <div key={`${i}-${ph}`} style={phStyle} onContextMenu={(e) => handleContextMenu(e, i)}>
          <span style={textStyle}>{ph}</span>
        </div>
      );
    }

    return result;
  }, [phSeq, phDur, scrollX, pixelsPerSecond, handleContextMenu]);

  const ctxPh = contextMenu ? phSeq[contextMenu.index] : '';
  const ctxDur = contextMenu ? (phDur[contextMenu.index] ?? 0) : 0;
  const f0Timestep = useProjectStore((s) => s.getCurrentSegment()?.data?.f0Timestep ?? 0.01);
  const ctxFrames = contextMenu ? Math.round(ctxDur / f0Timestep) : 0;

  return (
    <div style={styles.container}>
      <div style={styles.label}>音素</div>
      <div style={styles.content as React.CSSProperties}>
        {phonemes}
      </div>

      {contextMenu && (
        <PhonemeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          phoneme={ctxPh}
          duration={ctxDur}
          frameCount={ctxFrames}
          onRenamePhoneme={() => {
            setRenameIndex(contextMenu.index);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {renameIndex !== null && (
        <RenameDialog
          phoneme={phSeq[renameIndex]}
          onConfirm={handleRenamePhoneme}
          onCancel={() => setRenameIndex(null)}
        />
      )}
    </div>
  );
};

export default PhonemeTrack;
