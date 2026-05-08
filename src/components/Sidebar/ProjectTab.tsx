import React, { useState, useCallback } from 'react';

interface ProjectTabProps {
  projectName: string;
  onClose: () => void;
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    margin: '6px 8px 0',
    padding: '4px 6px 4px 10px',
    backgroundColor: '#2A2926',
    border: '0.5px solid #3D3A36',
    borderRadius: '4px',
    cursor: 'default',
    userSelect: 'none',
  } as React.CSSProperties,

  name: {
    flex: 1,
    fontSize: '11px',
    fontWeight: 400,
    color: '#E8E5DF',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    borderRadius: '3px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#5F5D58',
    fontSize: '12px',
    lineHeight: 1,
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
    transition: 'background-color 0.1s, color 0.1s',
  } as React.CSSProperties,
};

const ProjectTab: React.FC<ProjectTabProps> = ({ projectName, onClose }) => {
  const [hovered, setHovered] = useState(false);

  const handleEnter = useCallback(() => setHovered(true), []);
  const handleLeave = useCallback(() => setHovered(false), []);

  return (
    <div style={styles.container}>
      <span style={styles.name}>{projectName}</span>
      <button
        style={{
          ...styles.closeBtn,
          backgroundColor: hovered ? '#3D3A36' : 'transparent',
          color: hovered ? '#E8E5DF' : '#5F5D58',
        }}
        onClick={onClose}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        title="关闭项目"
      >
        ✕
      </button>
    </div>
  );
};

export default ProjectTab;
