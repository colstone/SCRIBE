// ============================================================================
// SCRIBE - Generic Context Menu Component
// ============================================================================

import React, { useEffect, useRef } from 'react';

export interface MenuItemDef {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  type?: 'item' | 'separator' | 'info';
}

export interface ContextMenuProps {
  x: number;
  y: number;
  contextLabel?: { text: string; type: 'note' | 'phoneme' | 'word' | 'roll' };
  items: MenuItemDef[];
  onClose: () => void;
}

const LABEL_STYLES: Record<string, { background: string; color: string }> = {
  note: { background: 'rgba(86,156,224,0.08)', color: '#6DB0F2' },
  phoneme: { background: 'rgba(180,130,240,0.08)', color: '#B482F0' },
  word: { background: 'rgba(93,202,165,0.08)', color: '#5DCAA5' },
  roll: { background: 'rgba(232,229,223,0.06)', color: '#A09D96' },
};

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  contextLabel,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid the triggering right-click from immediately closing
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('contextmenu', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('contextmenu', handleClick);
    };
  }, [onClose]);

  // Adjust position so the menu doesn't overflow the viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) {
      menuRef.current.style.left = `${vw - rect.width - 4}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${vh - rect.height - 4}px`;
    }
  }, [x, y]);

  const labelStyle = contextLabel ? LABEL_STYLES[contextLabel.type] : null;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 2000,
        minWidth: 195,
        background: '#1A1918',
        border: '0.5px solid #2A2926',
        borderRadius: 8,
        padding: 4,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
      }}
    >
      {contextLabel && labelStyle && (
        <div
          style={{
            fontSize: 9,
            fontWeight: 500,
            padding: '2px 6px',
            borderRadius: 4,
            margin: '2px 6px 4px',
            display: 'inline-block',
            background: labelStyle.background,
            color: labelStyle.color,
          }}
        >
          {contextLabel.text}
        </div>
      )}

      {items.map((item, i) => {
        if (item.type === 'separator') {
          return (
            <div
              key={`sep-${i}`}
              style={{
                height: 0,
                borderTop: '0.5px solid #2A2926',
                margin: '3px 10px',
              }}
            />
          );
        }

        if (item.type === 'info') {
          return (
            <div
              key={`info-${i}`}
              style={{
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 400,
                color: '#A09D96',
                cursor: 'default',
                userSelect: 'none',
              }}
            >
              {item.label}
            </div>
          );
        }

        const isDanger = item.danger;
        const isDisabled = item.disabled;

        return (
          <div
            key={`item-${i}`}
            onClick={() => {
              if (isDisabled) return;
              item.onClick?.();
              onClose();
            }}
            style={{
              padding: '6px 10px',
              borderRadius: 5,
              fontSize: 12,
              fontWeight: 400,
              color: isDanger ? '#E24B4A' : '#E8E5DF',
              opacity: isDisabled ? 0.35 : 1,
              cursor: isDisabled ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              userSelect: 'none',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!isDisabled) {
                (e.currentTarget as HTMLDivElement).style.background = '#2A2926';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span
                style={{
                  fontSize: 10,
                  fontFamily:
                    '"Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", monospace',
                  color: '#5F5D58',
                  marginLeft: 16,
                }}
              >
                {item.shortcut}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ContextMenu;
