// ============================================================================
// SCRIBE - Phoneme Context Menu
// ============================================================================

import React from 'react';
import { ContextMenu, MenuItemDef } from './ContextMenu';

export interface PhonemeContextMenuProps {
  x: number;
  y: number;
  phoneme: string;
  duration: number;
  frameCount: number;
  onRenamePhoneme: () => void;
  onClose: () => void;
}

export const PhonemeContextMenu: React.FC<PhonemeContextMenuProps> = ({
  x,
  y,
  phoneme,
  duration,
  frameCount,
  onRenamePhoneme,
  onClose,
}) => {
  const items: MenuItemDef[] = [
    {
      label: '修改音素标签',
      onClick: () => {
        onClose();
        onRenamePhoneme();
      },
    },
    { label: '', type: 'separator' },
    {
      label: `时长: ${duration.toFixed(3)}s  (${frameCount} 帧)`,
      type: 'info',
    },
  ];

  return (
    <ContextMenu
      x={x}
      y={y}
      contextLabel={{ text: phoneme, type: 'phoneme' }}
      items={items}
      onClose={onClose}
    />
  );
};

export default PhonemeContextMenu;
