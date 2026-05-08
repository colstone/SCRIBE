// ============================================================================
// SCRIBE - Roll (Empty Area) Context Menu
// ============================================================================

import React from 'react';
import { ContextMenu, MenuItemDef } from './ContextMenu';

export interface RollContextMenuProps {
  x: number;
  y: number;
  onAction: (action: string) => void;
  onClose: () => void;
}

export const RollContextMenu: React.FC<RollContextMenuProps> = ({
  x,
  y,
  onAction,
  onClose,
}) => {
  const items: MenuItemDef[] = [
    {
      label: '缩放至全部',
      shortcut: 'Ctrl+0',
      onClick: () => onAction('zoom_fit'),
    },
    {
      label: '放大',
      shortcut: 'Ctrl++',
      onClick: () => onAction('zoom_in'),
    },
    {
      label: '缩小',
      shortcut: 'Ctrl+-',
      onClick: () => onAction('zoom_out'),
    },
  ];

  return (
    <ContextMenu
      x={x}
      y={y}
      contextLabel={{ text: 'Roll', type: 'roll' }}
      items={items}
      onClose={onClose}
    />
  );
};

export default RollContextMenu;
