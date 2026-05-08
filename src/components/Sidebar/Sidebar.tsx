import React, { useState, useCallback, useMemo } from 'react';
import ProjectTab from './ProjectTab';
import NavTop from './NavTop';
import SearchBox from './SearchBox';
import SegmentList from './SegmentList';

interface SegmentData {
  name: string;
  status: 'todo' | 'wip' | 'done';
  noteCount: number;
  slurCount: number;
  duration: string;
}

interface SidebarProps {
  projectName: string;
  segments: SegmentData[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onCloseProject: () => void;
  doneCount: number;
  totalDuration: string;
}

const styles = {
  container: {
    width: '210px',
    height: '100%',
    backgroundColor: '#211F1E',
    borderRight: '0.5px solid #2A2926',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
  } as React.CSSProperties,
};

const Sidebar: React.FC<SidebarProps> = ({
  projectName,
  segments,
  selectedIndex,
  onSelect,
  onCloseProject,
  doneCount,
  totalDuration,
}) => {
  const [search, setSearch] = useState('');

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const filteredSegments = useMemo(() => {
    if (!search.trim()) return segments;
    const query = search.trim().toLowerCase();
    return segments.filter((s) => s.name.toLowerCase().includes(query));
  }, [segments, search]);

  const originalIndices = useMemo(() => {
    if (!search.trim()) return segments.map((_, i) => i);
    return filteredSegments.map((fs) => segments.findIndex((s) => s.name === fs.name));
  }, [segments, filteredSegments, search]);

  // Map filtered index back to original index
  const handleSelect = useCallback(
    (filteredIndex: number) => {
      if (!search.trim()) {
        onSelect(filteredIndex);
        return;
      }
      const filteredItem = filteredSegments[filteredIndex];
      const originalIndex = segments.findIndex((s) => s.name === filteredItem.name);
      if (originalIndex !== -1) {
        onSelect(originalIndex);
      }
    },
    [search, filteredSegments, segments, onSelect]
  );

  // Map selected original index to filtered index
  const filteredSelectedIndex = useMemo(() => {
    if (!search.trim()) return selectedIndex;
    const selectedName = segments[selectedIndex]?.name;
    return filteredSegments.findIndex((s) => s.name === selectedName);
  }, [search, selectedIndex, segments, filteredSegments]);

  return (
    <div style={styles.container}>
      {projectName && (
        <ProjectTab projectName={projectName} onClose={onCloseProject} />
      )}
      <NavTop
        projectName={projectName}
        doneCount={doneCount}
        totalCount={segments.length}
        totalDuration={totalDuration}
      />
      <SearchBox value={search} onChange={handleSearchChange} />
      <SegmentList
        segments={filteredSegments}
        originalIndices={originalIndices}
        selectedIndex={filteredSelectedIndex}
        onSelect={handleSelect}
      />
    </div>
  );
};

export default Sidebar;
