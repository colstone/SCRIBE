// ============================================================================
// SCRIBE - Note Context Menu
// ============================================================================

import React from 'react';
import { ContextMenu, MenuItemDef } from './ContextMenu';

export interface NoteContextMenuProps {
  x: number;
  y: number;
  noteId: string;
  noteName: string;
  onAction: (action: string) => void;
  onClose: () => void;
  canMerge: boolean;
  isSlur: boolean;
  canSetSlur: boolean;
  isRest: boolean;
}

export const NoteContextMenu: React.FC<NoteContextMenuProps> = ({
  x,
  y,
  noteId,
  noteName,
  onAction,
  onClose,
  canMerge,
  isSlur,
  canSetSlur,
  isRest,
}) => {
  const items: MenuItemDef[] = [
    {
      label: '从此处切分连音',
      shortcut: 'S',
      onClick: () => onAction('split'),
    },
    {
      label: '与后方音符合并',
      shortcut: 'M',
      disabled: !canMerge,
      onClick: () => onAction('merge'),
    },
    { label: '', type: 'separator' },
    {
      label: '升半音',
      shortcut: '↑',
      onClick: () => onAction('pitch_up'),
    },
    {
      label: '降半音',
      shortcut: '↓',
      onClick: () => onAction('pitch_down'),
    },
    {
      label: '吸附到 F0',
      onClick: () => onAction('snap_f0'),
    },
    { label: '', type: 'separator' },
    ...(isSlur
      ? [{
          label: '取消连音',
          onClick: () => onAction('unset_slur'),
        }]
      : canSetSlur
        ? [{
            label: '设为连音音符',
            onClick: () => onAction('set_slur'),
          }]
        : []),
    {
      label: isRest ? '设为正常音符' : '设为 rest',
      onClick: () => onAction(isRest ? 'unset_rest' : 'set_rest'),
    },
  ];

  return (
    <ContextMenu
      x={x}
      y={y}
      contextLabel={{ text: noteName, type: 'note' }}
      items={items}
      onClose={onClose}
    />
  );
};

export default NoteContextMenu;
