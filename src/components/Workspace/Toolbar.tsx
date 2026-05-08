import React, { useState, useCallback } from 'react';

// ============================================================================
// Toolbar
// ============================================================================

type ToolMode = 'select' | 'split' | 'merge';

interface ToolbarProps {
  mode: ToolMode;
  onModeChange: (mode: string) => void;
  onMerge: () => void;
  onPitchUp: () => void;
  onPitchDown: () => void;
  onAutoEstimate: () => void;
  onAutoSlur: () => void;
  onSnapCents: () => void;
}

const MONO_FONT = '"Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", monospace';
const SANS_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif';

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    padding: '3px 14px',
    backgroundColor: '#1A1918',
    borderBottom: '0.5px solid #2A2926',
    fontFamily: SANS_FONT,
    gap: '0px',
  } as React.CSSProperties,

  group: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  } as React.CSSProperties,

  separator: {
    width: '0.5px',
    height: '18px',
    backgroundColor: '#2A2926',
    margin: '0 8px',
    flexShrink: 0,
  } as React.CSSProperties,

  toolButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#A09D96',
    fontSize: '10px',
    fontWeight: 400,
    fontFamily: SANS_FONT,
    cursor: 'pointer',
    lineHeight: '1.2',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.1s, color 0.1s',
  } as React.CSSProperties,

  shortcutBadge: {
    fontSize: '8px',
    fontFamily: MONO_FONT,
    color: '#5F5D58',
    backgroundColor: '#2A2926',
    border: '0.5px solid #2A2926',
    padding: '0 4px',
    borderRadius: '2px',
    lineHeight: '1.5',
  } as React.CSSProperties,
};

// ---------------------------------------------------------------------------
// Reusable Hover Button for toolbar
// ---------------------------------------------------------------------------

const ToolButton: React.FC<{
  label: string;
  shortcut?: string;
  active?: boolean;
  accentColor?: string;
  onClick: () => void;
}> = ({ label, shortcut, active, accentColor, onClick }) => {
  const [hovered, setHovered] = useState(false);

  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);

  let bgColor = 'transparent';
  let textColor = '#A09D96';

  if (active) {
    bgColor = 'rgba(86,156,224,0.08)';
    textColor = '#6DB0F2';
  } else if (hovered) {
    bgColor = '#2A2926';
    textColor = '#E8E5DF';
  }

  if (accentColor && !active) {
    textColor = hovered ? accentColor : '#A09D96';
  }
  if (accentColor && active) {
    textColor = accentColor;
  }

  return (
    <button
      style={{
        ...styles.toolButton,
        backgroundColor: bgColor,
        color: textColor,
      }}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span>{label}</span>
      {shortcut && <span style={styles.shortcutBadge}>{shortcut}</span>}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Toolbar Component
// ---------------------------------------------------------------------------

const Toolbar: React.FC<ToolbarProps> = ({
  mode,
  onModeChange,
  onMerge,
  onPitchUp,
  onPitchDown,
  onAutoEstimate,
  onAutoSlur,
  onSnapCents,
}) => {
  return (
    <div style={styles.container}>
      {/* Mode group */}
      <div style={styles.group}>
        <ToolButton
          label="选择"
          shortcut="V"
          active={mode === 'select'}
          onClick={() => onModeChange('select')}
        />
        <ToolButton
          label="切分"
          shortcut="S"
          active={mode === 'split'}
          onClick={() => onModeChange('split')}
        />
        <ToolButton
          label="合并"
          shortcut="M"
          onClick={onMerge}
        />
      </div>

      <div style={styles.separator} />

      {/* Pitch group */}
      <div style={styles.group}>
        <ToolButton label="升" shortcut="↑" onClick={onPitchUp} />
        <ToolButton label="降" shortcut="↓" onClick={onPitchDown} />
      </div>

      <div style={styles.separator} />

      {/* Automation group */}
      <div style={styles.group}>
        <ToolButton
          label="自动估算"
          accentColor="#6DB0F2"
          onClick={onAutoEstimate}
        />
        <ToolButton
          label="拆分连音"
          accentColor="#5DCAA5"
          onClick={onAutoSlur}
        />
        <ToolButton
          label="吸附音分"
          accentColor="#7F77DD"
          onClick={onSnapCents}
        />
      </div>
    </div>
  );
};

export default Toolbar;
