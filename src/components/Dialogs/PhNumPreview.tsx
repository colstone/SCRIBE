import React, { useMemo } from 'react';

interface PhNumPreviewProps {
  phSeq: string[];
  phNum: number[];
  warnings: string[];
}

const FONT_MONO = '"Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", monospace';
const FONT_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif';

const BLUE_BG = 'rgba(86,156,224,0.08)';
const GREEN_BG = 'rgba(93,202,165,0.08)';

const styles = {
  container: {
    fontFamily: FONT_MONO,
    fontSize: '11px',
    lineHeight: 1.6,
  } as React.CSSProperties,

  previewArea: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '2px',
    padding: '10px',
    backgroundColor: '#1A1918',
    borderRadius: '6px',
    border: '0.5px solid #2A2926',
    maxHeight: '200px',
    overflowY: 'auto',
  } as React.CSSProperties,

  wordGroup: {
    display: 'inline-flex',
    gap: '3px',
    padding: '2px 6px',
    borderRadius: '4px',
    margin: '1px 0',
  } as React.CSSProperties,

  phoneme: {
    color: '#E8E5DF',
    fontSize: '11px',
    fontFamily: FONT_MONO,
  } as React.CSSProperties,

  warningsContainer: {
    marginTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  } as React.CSSProperties,

  warning: {
    fontSize: '10px',
    fontWeight: 400,
    color: '#EF9F27',
    fontFamily: FONT_SANS,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,
};

const PhNumPreview: React.FC<PhNumPreviewProps> = ({ phSeq, phNum, warnings }) => {
  const groups = useMemo(() => {
    const result: { phonemes: string[]; groupIndex: number }[] = [];
    let phIdx = 0;
    for (let gi = 0; gi < phNum.length; gi++) {
      const count = phNum[gi];
      const phonemes = phSeq.slice(phIdx, phIdx + count);
      result.push({ phonemes, groupIndex: gi });
      phIdx += count;
    }
    return result;
  }, [phSeq, phNum]);

  return (
    <div style={styles.container}>
      <div style={styles.previewArea}>
        {groups.map((group, idx) => {
          const bgColor = idx % 2 === 0 ? BLUE_BG : GREEN_BG;
          return (
            <div
              key={idx}
              style={{
                ...styles.wordGroup,
                backgroundColor: bgColor,
              }}
            >
              {group.phonemes.map((ph, pi) => (
                <span key={pi} style={styles.phoneme}>
                  {ph}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      {warnings.length > 0 && (
        <div style={styles.warningsContainer}>
          {warnings.map((w, i) => (
            <div key={i} style={styles.warning}>
              <span>⚠</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PhNumPreview;
