import React, { useState, useCallback } from 'react';
import SegmentItem from './SegmentItem';
import SegmentContextMenu from '../ContextMenus/SegmentContextMenu';
import { useProjectStore } from '../../stores/projectStore';

interface SegmentData {
  name: string;
  status: 'todo' | 'wip' | 'done';
  noteCount: number;
  slurCount: number;
  duration: string;
}

interface SegmentListProps {
  segments: SegmentData[];
  originalIndices: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

const styles = {
  container: {
    padding: '2px 6px',
    overflowY: 'auto',
    flex: 1,
  } as React.CSSProperties,
};

const SegmentList: React.FC<SegmentListProps> = ({
  segments,
  originalIndices,
  selectedIndex,
  onSelect,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; index: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, index });
  }, []);

  const handleAction = useCallback((action: string) => {
    if (!contextMenu) return;
    const projStore = useProjectStore.getState();
    const origIdx = originalIndices[contextMenu.index];
    if (action === 'mark_done') {
      projStore.updateSegmentStatus(origIdx, 'done');
    } else if (action === 'mark_todo') {
      projStore.updateSegmentStatus(origIdx, 'todo');
    } else if (action === 'copy_filename') {
      const seg = segments[contextMenu.index];
      if (seg) navigator.clipboard.writeText(seg.name);
    } else if (action === 'mark_all_done') {
      for (let i = 0; i < originalIndices.length; i++) {
        projStore.updateSegmentStatus(originalIndices[i], 'done');
      }
    }
    setContextMenu(null);
  }, [contextMenu, segments, originalIndices]);

  return (
    <div style={styles.container}>
      {segments.map((seg, index) => (
        <SegmentItem
          key={seg.name}
          name={seg.name}
          status={seg.status}
          noteCount={seg.noteCount}
          slurCount={seg.slurCount}
          duration={seg.duration}
          isSelected={index === selectedIndex}
          onClick={() => onSelect(index)}
          onContextMenu={(e) => handleContextMenu(e, index)}
        />
      ))}

      {contextMenu && (
        <SegmentContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onAction={handleAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default SegmentList;
