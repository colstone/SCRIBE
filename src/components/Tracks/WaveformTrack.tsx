import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { precomputeEnvelope, renderWaveform, WaveformEnvelope } from '../../canvas/waveformRenderer';

// ============================================================================
// WaveformTrack - Canvas-based waveform display
// ============================================================================

interface WaveformTrackProps {
  scrollX: number;
  pixelsPerSecond: number;
  waveformData: Float32Array | null;
  sampleRate: number;
  onSeek?: (time: number) => void;
}

const HEIGHT = 48;
const LABEL_WIDTH = 48;
const SANS_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif';

const styles = {
  container: {
    height: `${HEIGHT}px`,
    backgroundColor: '#1A1918',
    display: 'flex',
    flexDirection: 'row',
    flexShrink: 0,
    overflow: 'hidden',
  } as React.CSSProperties,

  label: {
    width: `${LABEL_WIDTH}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 500,
    color: '#A09D96',
    fontFamily: SANS_FONT,
    flexShrink: 0,
    userSelect: 'none',
  } as React.CSSProperties,

  canvasArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  } as React.CSSProperties,

  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  } as React.CSSProperties,
};

const WaveformTrack: React.FC<WaveformTrackProps> = ({
  scrollX,
  pixelsPerSecond,
  waveformData,
  sampleRate,
  onSeek,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = scrollX + x / pixelsPerSecond;
    onSeek(Math.max(0, time));
  }, [scrollX, pixelsPerSecond, onSeek]);

  // Precompute envelope when waveform data changes
  const envelope = useMemo<WaveformEnvelope | null>(() => {
    if (!waveformData || waveformData.length === 0) return null;
    return precomputeEnvelope(waveformData, sampleRate);
  }, [waveformData, sampleRate]);

  // Set up canvas for high-DPI rendering and return context
  const setupCanvas = useCallback((): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return null;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(dpr, dpr);
    return ctx;
  }, []);

  // Draw the waveform
  const draw = useCallback(() => {
    const ctx = setupCanvas();
    if (!ctx) return;

    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();

    ctx.clearRect(0, 0, rect.width, rect.height);

    if (envelope) {
      renderWaveform(ctx, envelope, scrollX, pixelsPerSecond, rect.width, rect.height);
    }
  }, [setupCanvas, envelope, scrollX, pixelsPerSecond]);

  // Re-render when dependencies change
  useEffect(() => {
    draw();
  }, [draw]);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      draw();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [draw]);

  return (
    <div style={styles.container}>
      <div style={styles.label}>波形</div>
      <div ref={containerRef} style={{ ...styles.canvasArea, cursor: 'pointer' } as React.CSSProperties} onClick={handleClick}>
        <canvas ref={canvasRef} style={styles.canvas} />
      </div>
    </div>
  );
};

export default WaveformTrack;
