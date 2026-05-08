import React, { useState, useCallback, useRef } from 'react';

// ============================================================================
// Playbar
// ============================================================================

interface PlaybarProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  cursorInfo: string;
  noteCount: number;
  slurCount: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
}

const MONO_FONT = '"Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", monospace';
const SANS_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif';

/** Format seconds to M:SS.T */
function formatTime(seconds: number): string {
  const totalMs = Math.floor(seconds * 10);
  const tenths = totalMs % 10;
  const totalSec = Math.floor(seconds);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}.${tenths}`;
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    padding: '5px 14px',
    backgroundColor: '#211F1E',
    borderTop: '0.5px solid #2A2926',
    fontFamily: SANS_FONT,
    gap: '10px',
    flexShrink: 0,
  } as React.CSSProperties,

  playButton: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    backgroundColor: '#6DB0F2',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 0,
    transition: 'opacity 0.1s',
  } as React.CSSProperties,

  timeDisplay: {
    fontSize: '11px',
    fontFamily: MONO_FONT,
    color: '#A09D96',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    userSelect: 'none',
  } as React.CSSProperties,

  progressContainer: {
    flex: 1,
    height: '3px',
    borderRadius: '2px',
    backgroundColor: '#2A2926',
    cursor: 'pointer',
    position: 'relative',
    minWidth: '60px',
  } as React.CSSProperties,

  progressFill: {
    height: '100%',
    borderRadius: '2px',
    backgroundColor: '#6DB0F2',
    pointerEvents: 'none',
  } as React.CSSProperties,

  infoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
    userSelect: 'none',
  } as React.CSSProperties,

  infoLabel: {
    fontSize: '10px',
    fontWeight: 400,
    color: '#5F5D58',
  } as React.CSSProperties,

  infoValue: {
    fontSize: '10px',
    fontWeight: 400,
    color: '#A09D96',
    fontFamily: MONO_FONT,
  } as React.CSSProperties,

  infoSeparator: {
    color: '#5F5D58',
    fontSize: '10px',
    padding: '0 2px',
    userSelect: 'none',
  } as React.CSSProperties,
};

// ---------------------------------------------------------------------------
// Play icon (CSS triangle)
// ---------------------------------------------------------------------------

const PlayIcon: React.FC = () => (
  <div
    style={{
      width: 0,
      height: 0,
      borderTop: '5px solid transparent',
      borderBottom: '5px solid transparent',
      borderLeft: '8px solid #FFFFFF',
      marginLeft: '2px',
    }}
  />
);

const PauseIcon: React.FC = () => (
  <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
    <div
      style={{
        width: '2.5px',
        height: '10px',
        backgroundColor: '#FFFFFF',
        borderRadius: '0.5px',
      }}
    />
    <div
      style={{
        width: '2.5px',
        height: '10px',
        backgroundColor: '#FFFFFF',
        borderRadius: '0.5px',
      }}
    />
  </div>
);

// ---------------------------------------------------------------------------
// Playbar Component
// ---------------------------------------------------------------------------

const Playbar: React.FC<PlaybarProps> = ({
  isPlaying,
  currentTime,
  duration,
  cursorInfo,
  noteCount,
  slurCount,
  onTogglePlay,
  onSeek,
}) => {
  const [playHovered, setPlayHovered] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  const handlePlayEnter = useCallback(() => setPlayHovered(true), []);
  const handlePlayLeave = useCallback(() => setPlayHovered(false), []);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressRef.current;
      if (!bar || duration <= 0) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek]
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div style={styles.container}>
      {/* Play/pause button */}
      <button
        style={{
          ...styles.playButton,
          opacity: playHovered ? 0.85 : 1,
        }}
        onClick={onTogglePlay}
        onMouseEnter={handlePlayEnter}
        onMouseLeave={handlePlayLeave}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* Time display */}
      <span style={styles.timeDisplay}>
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {/* Progress bar */}
      <div
        ref={progressRef}
        style={styles.progressContainer as React.CSSProperties}
        onClick={handleProgressClick}
      >
        <div
          style={{
            ...styles.progressFill,
            width: `${Math.min(100, progress)}%`,
          } as React.CSSProperties}
        />
      </div>

      {/* Info group */}
      <div style={styles.infoGroup}>
        <span>
          <span style={styles.infoLabel}>光标 </span>
          <span style={styles.infoValue}>{cursorInfo}</span>
        </span>
        <span style={styles.infoSeparator}>|</span>
        <span>
          <span style={styles.infoLabel}>音符 </span>
          <span style={styles.infoValue}>{noteCount}</span>
        </span>
        <span style={styles.infoSeparator}>|</span>
        <span>
          <span style={styles.infoLabel}>连音 </span>
          <span style={styles.infoValue}>{slurCount}</span>
        </span>
      </div>
    </div>
  );
};

export default Playbar;
