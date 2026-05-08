import React, { useState, useCallback } from 'react';
import { useStatusStore, type StatusColor } from '../../stores/statusStore';

// ============================================================================
// WorkspaceHeader
// ============================================================================

interface WorkspaceHeaderProps {
  title: string;
  onUndo: () => void;
  onRedo: () => void;
  onMarkDone: () => void;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 14px',
    backgroundColor: '#211F1E',
    borderBottom: '0.5px solid #2A2926',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
  } as React.CSSProperties,

  title: {
    flex: 1,
    fontSize: '12px',
    fontWeight: 500,
    color: '#E8E5DF',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    userSelect: 'none',
  } as React.CSSProperties,

  buttonGroup: {
    display: 'flex',
    gap: '4px',
    flexShrink: 0,
  } as React.CSSProperties,

  button: {
    padding: '4px 10px',
    borderRadius: '5px',
    backgroundColor: 'transparent',
    border: '0.5px solid #2A2926',
    color: '#A09D96',
    fontSize: '11px',
    fontWeight: 400,
    fontFamily: 'inherit',
    cursor: 'pointer',
    lineHeight: '1.2',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.1s, color 0.1s',
  } as React.CSSProperties,

  buttonDisabled: {
    padding: '4px 10px',
    borderRadius: '5px',
    backgroundColor: 'transparent',
    border: '0.5px solid #2A2926',
    color: '#5F5D58',
    fontSize: '11px',
    fontWeight: 400,
    fontFamily: 'inherit',
    cursor: 'default',
    lineHeight: '1.2',
    whiteSpace: 'nowrap',
    opacity: 0.5,
  } as React.CSSProperties,

  primaryButton: {
    padding: '4px 10px',
    borderRadius: '5px',
    backgroundColor: '#6DB0F2',
    border: '0.5px solid #6DB0F2',
    color: '#FFFFFF',
    fontSize: '11px',
    fontWeight: 400,
    fontFamily: 'inherit',
    cursor: 'pointer',
    lineHeight: '1.2',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.1s',
  } as React.CSSProperties,

  statusArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginRight: '12px',
    flexShrink: 0,
  } as React.CSSProperties,

  statusText: {
    fontSize: '10px',
    fontWeight: 400,
    color: '#A09D96',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  } as React.CSSProperties,

  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  } as React.CSSProperties,
};

const HoverButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
}> = ({ onClick, disabled, primary, children }) => {
  const [hovered, setHovered] = useState(false);

  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);

  if (disabled) {
    return (
      <button style={styles.buttonDisabled} disabled>
        {children}
      </button>
    );
  }

  if (primary) {
    return (
      <button
        style={{
          ...styles.primaryButton,
          opacity: hovered ? 0.85 : 1,
        }}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      style={{
        ...styles.button,
        backgroundColor: hovered ? '#2A2926' : 'transparent',
        color: hovered ? '#E8E5DF' : '#A09D96',
      }}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </button>
  );
};

const STATUS_COLORS: Record<StatusColor, string> = {
  idle: '#5F5D58',
  working: '#6DB0F2',
  success: '#5DCAA5',
  error: '#E24B4A',
};

const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  title,
  onUndo,
  onRedo,
  onMarkDone,
  onSave,
  canUndo,
  canRedo,
}) => {
  const statusText = useStatusStore((s) => s.text);
  const statusColor = useStatusStore((s) => s.color);

  return (
    <div style={styles.container}>
      <div style={styles.title}>{title}</div>
      <div style={styles.statusArea}>
        <span style={styles.statusText}>{statusText}</span>
        <span
          style={{
            ...styles.statusDot,
            backgroundColor: STATUS_COLORS[statusColor],
            boxShadow: statusColor === 'working' ? `0 0 6px ${STATUS_COLORS.working}` : 'none',
          }}
        />
      </div>
      <div style={styles.buttonGroup}>
        <HoverButton onClick={onUndo} disabled={!canUndo}>
          撤销
        </HoverButton>
        <HoverButton onClick={onRedo} disabled={!canRedo}>
          重做
        </HoverButton>
        <HoverButton onClick={onMarkDone}>标记完成</HoverButton>
        <HoverButton onClick={onSave} primary>
          保存
        </HoverButton>
      </div>
    </div>
  );
};

export default WorkspaceHeader;
