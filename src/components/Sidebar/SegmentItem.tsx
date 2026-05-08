import React, { useState, useCallback } from 'react';

type SegmentStatus = 'todo' | 'wip' | 'done';

interface SegmentItemProps {
  name: string;
  status: SegmentStatus;
  noteCount: number;
  slurCount: number;
  duration: string;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const STATUS_COLORS: Record<SegmentStatus, string> = {
  done: '#5DCAA5',
  wip: '#6DB0F2',
  todo: '#3D3A36',
};

const styles = {
  container: {
    padding: '6px 8px',
    borderRadius: '6px',
    marginBottom: '1px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '7px',
    userSelect: 'none',
  } as React.CSSProperties,

  dot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
    marginTop: '3px',
  } as React.CSSProperties,

  textCol: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    flex: 1,
  } as React.CSSProperties,

  name: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#E8E5DF',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  meta: {
    fontSize: '9px',
    fontWeight: 400,
    color: '#5F5D58',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
    marginTop: '2px',
  } as React.CSSProperties,
};

const SegmentItem: React.FC<SegmentItemProps> = ({
  name,
  status,
  noteCount,
  slurCount,
  duration,
  isSelected,
  onClick,
  onContextMenu,
}) => {
  const [hovered, setHovered] = useState(false);

  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);

  const containerStyle: React.CSSProperties = {
    ...styles.container,
    ...(isSelected
      ? { backgroundColor: 'rgba(86,156,224,0.08)' }
      : hovered
        ? { backgroundColor: '#2A2926' }
        : {}),
  };

  const nameStyle: React.CSSProperties = {
    ...styles.name,
    ...(isSelected ? { color: '#6DB0F2' } : {}),
  };

  return (
    <div
      style={containerStyle}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        style={{
          ...styles.dot,
          backgroundColor: STATUS_COLORS[status],
        }}
      />
      <div style={styles.textCol}>
        <div style={nameStyle}>{name}</div>
        <div style={styles.meta}>
          {duration} · {noteCount}音符 · {slurCount}连音
        </div>
      </div>
    </div>
  );
};

export default SegmentItem;
