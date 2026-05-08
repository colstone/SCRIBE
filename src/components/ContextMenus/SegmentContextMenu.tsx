// ============================================================================
// SCRIBE - Segment Context Menu
// ============================================================================

import React from 'react';
import { ContextMenu, MenuItemDef } from './ContextMenu';

export interface SegmentContextMenuProps {
  x: number;
  y: number;
  onAction: (action: string) => void;
  onClose: () => void;
}

export const SegmentContextMenu: React.FC<SegmentContextMenuProps> = ({
  x,
  y,
  onAction,
  onClose,
}) => {
  const items: MenuItemDef[] = [
    {
      label: '标记为已完成',
      onClick: () => onAction('mark_done'),
    },
    {
      label: '标记为未完成',
      onClick: () => onAction('mark_todo'),
    },
    { label: '', type: 'separator' },
    {
      label: '复制文件名',
      onClick: () => onAction('copy_filename'),
    },
    { label: '', type: 'separator' },
    {
      label: '全部标记为已完成',
      onClick: () => onAction('mark_all_done'),
    },
  ];

  return (
    <ContextMenu
      x={x}
      y={y}
      items={items}
      onClose={onClose}
    />
  );
};

export default SegmentContextMenu;
