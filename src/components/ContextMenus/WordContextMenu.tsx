// ============================================================================
// SCRIBE - Word Group Context Menu
// ============================================================================

import React from 'react';
import { ContextMenu, MenuItemDef } from './ContextMenu';

export interface WordContextMenuProps {
  x: number;
  y: number;
  phNum: number;
  phonemes: string[];
  onAction: (action: string) => void;
  onClose: () => void;
}

export const WordContextMenu: React.FC<WordContextMenuProps> = ({
  x,
  y,
  phNum,
  phonemes,
  onAction,
  onClose,
}) => {
  const items: MenuItemDef[] = [
    {
      label: '在此处拆分词组',
      onClick: () => onAction('split_word'),
    },
    {
      label: '与后方词组合并',
      onClick: () => onAction('merge_word'),
    },
    { label: '', type: 'separator' },
    {
      label: `ph_num: ${phNum}`,
      type: 'info',
    },
    {
      label: `音素: ${phonemes.join(' ')}`,
      type: 'info',
    },
  ];

  return (
    <ContextMenu
      x={x}
      y={y}
      contextLabel={{ text: `词组 (${phonemes.length} ph)`, type: 'word' }}
      items={items}
      onClose={onClose}
    />
  );
};

export default WordContextMenu;
