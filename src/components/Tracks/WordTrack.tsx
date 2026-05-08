import React, { useMemo, useState, useCallback } from 'react';
import WordContextMenu from '../ContextMenus/WordContextMenu';

// ============================================================================
// WordTrack
// ============================================================================

interface WordGroupData {
  phSeq: string[];
  phNum: number;
  startTime: number;
  duration: number;
}

interface WordTrackProps {
  wordGroups: WordGroupData[];
  scrollX: number;
  pixelsPerSecond: number;
}

const HEIGHT = 32;
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
};

const WordTrack: React.FC<WordTrackProps> = ({ wordGroups, scrollX, pixelsPerSecond }) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; index: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, index });
  }, []);

  const words = useMemo(() => {
    const result: React.ReactNode[] = [];

    for (let i = 0; i < wordGroups.length; i++) {
      const wg = wordGroups[i];
      const x = (wg.startTime - scrollX) * pixelsPerSecond;
      const w = wg.duration * pixelsPerSecond;

      // Skip words entirely outside viewport
      if (x + w < 0) continue;

      const isEven = i % 2 === 0;
      const bgColor = isEven
        ? 'rgba(86,156,224,0.04)'
        : 'rgba(93,202,165,0.04)';

      const showBorder = w >= 2;
      const showPhNum = w >= 30;

      const wordStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${x}px`,
        top: 0,
        width: `${Math.max(0, w)}px`,
        height: '100%',
        backgroundColor: bgColor,
        borderRight: showBorder ? '1px solid #33312E' : 'none',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        padding: '2px 4px',
      };

      const textStyle: React.CSSProperties = {
        fontSize: '9px',
        fontFamily: MONO_FONT,
        color: '#A09D96',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        userSelect: 'none',
        width: '100%',
        textAlign: 'center',
      };

      const phNumStyle: React.CSSProperties = {
        position: 'absolute',
        top: '2px',
        right: '3px',
        fontSize: '7px',
        fontFamily: MONO_FONT,
        color: '#5F5D58',
        userSelect: 'none',
        lineHeight: '1',
      };

      result.push(
        <div key={i} style={wordStyle} onContextMenu={(e) => handleContextMenu(e, i)}>
          <span style={textStyle}>{wg.phSeq.join(' ')}</span>
          {showPhNum && <span style={phNumStyle}>{wg.phNum}</span>}
        </div>
      );
    }

    return result;
  }, [wordGroups, scrollX, pixelsPerSecond, handleContextMenu]);

  const ctxWg = contextMenu ? wordGroups[contextMenu.index] : null;

  return (
    <div style={styles.container}>
      <div style={styles.label}>词组</div>
      <div style={styles.content as React.CSSProperties}>
        {words}
      </div>

      {contextMenu && ctxWg && (
        <WordContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          phNum={ctxWg.phNum}
          phonemes={ctxWg.phSeq}
          onAction={() => setContextMenu(null)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default WordTrack;
