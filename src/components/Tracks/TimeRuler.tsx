import React, { useRef, useEffect, useCallback } from 'react';

// ============================================================================
// TimeRuler - Canvas-based time ruler with tick marks
// ============================================================================

interface TimeRulerProps {
  scrollX: number;
  pixelsPerSecond: number;
  width: number;
  onSeek?: (time: number) => void;
}

const HEIGHT = 18;
const LEFT_PADDING = 48; // Align with piano keys area
const MONO_FONT = '"Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", monospace';

const styles = {
  container: {
    height: `${HEIGHT}px`,
    backgroundColor: '#1A1918',
    position: 'relative',
    flexShrink: 0,
    overflow: 'hidden',
  } as React.CSSProperties,

  canvas: {
    display: 'block',
  } as React.CSSProperties,
};

const TimeRuler: React.FC<TimeRulerProps> = ({ scrollX, pixelsPerSecond, width, onSeek }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - LEFT_PADDING;
    if (x < 0) return;
    const time = scrollX + x / pixelsPerSecond;
    onSeek(Math.max(0, time));
  }, [scrollX, pixelsPerSecond, onSeek]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = width;
    const canvasHeight = HEIGHT;

    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Determine visible time range (account for left padding)
    const contentWidth = canvasWidth - LEFT_PADDING;
    if (contentWidth <= 0) return;

    const visibleStartTime = scrollX;
    const visibleEndTime = scrollX + contentWidth / pixelsPerSecond;

    // Determine tick interval based on zoom level
    // We want roughly every 80-150 px for major ticks
    const idealMajorPx = 100;
    const idealInterval = idealMajorPx / pixelsPerSecond;

    // Snap to nice intervals: 0.1, 0.25, 0.5, 1, 2, 5, 10, ...
    const niceIntervals = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
    let majorInterval = 1;
    for (const ni of niceIntervals) {
      if (ni >= idealInterval * 0.5) {
        majorInterval = ni;
        break;
      }
    }

    const minorInterval = majorInterval / 2;

    // Start from the first tick before the visible range
    const firstMajor = Math.floor(visibleStartTime / majorInterval) * majorInterval;

    ctx.font = `8px ${MONO_FONT}`;
    ctx.textBaseline = 'middle';

    // Draw minor ticks first (0.5s subdivisions)
    const firstMinor = Math.floor(visibleStartTime / minorInterval) * minorInterval;
    for (let t = firstMinor; t <= visibleEndTime + minorInterval; t += minorInterval) {
      // Skip positions that are major ticks
      const isMajor = Math.abs(t / majorInterval - Math.round(t / majorInterval)) < 0.001;
      if (isMajor) continue;

      const x = LEFT_PADDING + (t - scrollX) * pixelsPerSecond;
      if (x < LEFT_PADDING || x > canvasWidth) continue;

      ctx.strokeStyle = '#2A2926';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, canvasHeight - 2);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }

    // Draw major ticks (whole seconds or the determined interval)
    for (let t = firstMajor; t <= visibleEndTime + majorInterval; t += majorInterval) {
      const x = LEFT_PADDING + (t - scrollX) * pixelsPerSecond;
      if (x < LEFT_PADDING - 20 || x > canvasWidth) continue;

      // Tick line
      ctx.strokeStyle = '#3D3A36';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, canvasHeight - 3);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();

      // Label
      const label = formatRulerTime(t);
      ctx.fillStyle = '#5F5D58';
      ctx.fillText(label, x + 3, canvasHeight / 2);
    }
  }, [scrollX, pixelsPerSecond, width]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div style={styles.container}>
      <canvas ref={canvasRef} style={{ ...styles.canvas, cursor: 'pointer' }} onClick={handleClick} />
    </div>
  );
};

/** Format time value for the ruler. */
function formatRulerTime(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const totalMs = Math.round(seconds * 1000);
  const sec = totalMs / 1000;

  if (sec < 60) {
    // Show as seconds with appropriate precision
    if (Number.isInteger(sec)) {
      return `${sec.toFixed(0)}s`;
    }
    return `${sec.toFixed(1)}s`;
  }

  const min = Math.floor(sec / 60);
  const rem = sec - min * 60;
  if (Number.isInteger(rem)) {
    return `${min}:${rem.toFixed(0).padStart(2, '0')}`;
  }
  return `${min}:${rem.toFixed(1).padStart(4, '0')}`;
}

export default TimeRuler;
