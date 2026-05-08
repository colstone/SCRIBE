import React from 'react';

interface NavTopProps {
  projectName: string;
  doneCount: number;
  totalCount: number;
  totalDuration: string;
}

const styles = {
  container: {
    padding: '12px 14px 8px',
    borderBottom: '0.5px solid #2A2926',
  } as React.CSSProperties,

  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,

  noteIcon: {
    color: '#6DB0F2',
    fontSize: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
  } as React.CSSProperties,

  projectName: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#E8E5DF',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  tagsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '8px',
    flexWrap: 'wrap',
  } as React.CSSProperties,

  tag: {
    fontSize: '10px',
    fontWeight: 400,
    color: '#A09D96',
    backgroundColor: '#2A2926',
    borderRadius: '10px',
    padding: '2px 8px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
};

const NavTop: React.FC<NavTopProps> = ({
  projectName,
  doneCount,
  totalCount,
  totalDuration,
}) => {
  return (
    <div style={styles.container}>
      <div style={styles.titleRow}>
        <span style={styles.noteIcon}>♪</span>
        <span style={styles.projectName}>{projectName}</span>
      </div>
      <div style={styles.tagsRow}>
        <span style={styles.tag}>
          {doneCount}/{totalCount} 完成
        </span>
        <span style={styles.tag}>{totalDuration}</span>
      </div>
    </div>
  );
};

export default NavTop;
