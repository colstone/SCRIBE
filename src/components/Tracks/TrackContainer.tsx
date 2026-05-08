import React, { useRef, useCallback, useEffect, useState } from 'react';
import TimeRuler from './TimeRuler';
import PianoRollTrack from './PianoRollTrack';
import PhonemeTrack from './PhonemeTrack';
import WordTrack from './WordTrack';
import WaveformTrack from './WaveformTrack';
import { useEditorStore } from '../../stores/editorStore';
import { useProjectStore } from '../../stores/projectStore';
import { useAudioStore } from '../../stores/audioStore';
import { useSettingsStore } from '../../stores/settingsStore';

// ============================================================================
// TrackContainer - Composes all tracks with zoom/pan controls
// ============================================================================

const WAVEFORM_HEIGHT = 48;
const ZOOM_FACTOR = 1.2;

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  } as React.CSSProperties,

  trackSeparator: {
    height: '0.5px',
    backgroundColor: '#2A2926',
    flexShrink: 0,
  } as React.CSSProperties,
};

const TrackContainer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Store subscriptions
  const scrollX = useEditorStore((s) => s.scrollX);
  const pixelsPerSecond = useEditorStore((s) => s.pixelsPerSecond);
  const zoom = useEditorStore((s) => s.zoom);
  const setScrollX = useEditorStore((s) => s.setScrollX);
  const scrollVertical = useEditorStore((s) => s.scrollVertical);

  const segment = useProjectStore((s) => s.getCurrentSegment());

  const waveformData = useAudioStore((s) => s.waveformData);
  const sampleRate = useAudioStore((s) => s.sampleRate);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentTime = useAudioStore((s) => s.currentTime);

  const seekTo = useAudioStore((s) => s.seekTo);

  // Auto-scroll to follow playback cursor
  useEffect(() => {
    if (!isPlaying) return;
    const contentWidth = containerWidth - 48;
    if (contentWidth <= 0) return;
    const visibleEnd = scrollX + contentWidth / pixelsPerSecond;
    const visibleStart = scrollX;
    if (currentTime > visibleEnd - 0.5) {
      setScrollX(currentTime - contentWidth * 0.1 / pixelsPerSecond);
    } else if (currentTime < visibleStart) {
      setScrollX(currentTime);
    }
  }, [isPlaying, currentTime, scrollX, pixelsPerSecond, containerWidth, setScrollX]);

  // Track container width for TimeRuler
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    const el = containerRef.current;
    if (el) {
      observer.observe(el);
      setContainerWidth(el.getBoundingClientRect().width);
    }

    return () => observer.disconnect();
  }, []);

  const navigationMode = useSettingsStore((s) => s.navigationMode);
  const pixelsPerSemitone = useEditorStore((s) => s.pixelsPerSemitone);

  // ---------------------------------------------------------------------------
  // Wheel handler — branched by navigation mode
  // ---------------------------------------------------------------------------
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - 48;

      if (navigationMode === 'trackpad') {
        if (e.ctrlKey || e.metaKey) {
          const factor = 1 - e.deltaY * 0.01;
          zoom(Math.max(0.5, Math.min(2.0, factor)), mouseX, rect.width - 48);
        } else {
          const dx = -e.deltaX / pixelsPerSecond;
          setScrollX(scrollX + dx);
          const semitones = -e.deltaY / pixelsPerSemitone;
          if (Math.abs(semitones) > 0.01) scrollVertical(semitones);
        }
      } else {
        // mouse mode (also used as fallback for touch)
        if (e.ctrlKey || e.metaKey) {
          const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
          zoom(factor, mouseX, rect.width - 48);
        } else if (e.shiftKey) {
          const delta = e.deltaY / pixelsPerSecond;
          setScrollX(scrollX + delta);
        } else {
          const semitones = e.deltaY > 0 ? -3 : 3;
          scrollVertical(semitones);
        }
      }
    },
    [navigationMode, zoom, pixelsPerSecond, pixelsPerSemitone, scrollX, setScrollX, scrollVertical]
  );

  // Middle-button drag for panning
  const isPanningRef = useRef(false);
  const panStartXRef = useRef(0);
  const panStartScrollRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle button (button === 1)
      if (e.button === 1) {
        e.preventDefault();
        isPanningRef.current = true;
        panStartXRef.current = e.clientX;
        panStartScrollRef.current = scrollX;
      }
    },
    [scrollX]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanningRef.current) {
        const deltaX = e.clientX - panStartXRef.current;
        const deltaTime = deltaX / pixelsPerSecond;
        setScrollX(panStartScrollRef.current - deltaTime);
      }
    },
    [pixelsPerSecond, setScrollX]
  );

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) {
      isPanningRef.current = false;
    }
  }, []);

  // Also handle mouse leaving the container
  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // ---------------------------------------------------------------------------
  // Touch handling (touch mode)
  // ---------------------------------------------------------------------------
  const touchStartRef = useRef<{ x: number; y: number; scrollX: number; dist: number; pps: number } | null>(null);
  const lastDoubleTapRef = useRef(0);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (navigationMode !== 'touch') return;
      if (e.touches.length === 1) {
        const now = Date.now();
        if (now - lastDoubleTapRef.current < 300) {
          // Double-tap: zoom to fit
          if (segment) {
            const contentWidth = containerWidth - 48;
            useEditorStore.getState().zoomToFit(segment.audioDuration, contentWidth);
          }
          lastDoubleTapRef.current = 0;
          return;
        }
        lastDoubleTapRef.current = now;
        touchStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          scrollX,
          dist: 0,
          pps: pixelsPerSecond,
        };
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        touchStartRef.current = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
          scrollX,
          dist: Math.hypot(dx, dy),
          pps: pixelsPerSecond,
        };
      }
    },
    [navigationMode, scrollX, pixelsPerSecond, segment, containerWidth]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (navigationMode !== 'touch' || !touchStartRef.current) return;
      e.preventDefault();
      const start = touchStartRef.current;

      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - start.x;
        const deltaTime = dx / pixelsPerSecond;
        setScrollX(start.scrollX - deltaTime);
        const dy = e.touches[0].clientY - start.y;
        const semitones = dy / pixelsPerSemitone;
        if (Math.abs(semitones) > 0.5) scrollVertical(semitones > 0 ? -1 : 1);
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.hypot(dx, dy);
        if (start.dist > 0) {
          const scale = dist / start.dist;
          const container = containerRef.current;
          if (container) {
            const rect = container.getBoundingClientRect();
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left - 48;
            zoom(scale / 1, midX, rect.width - 48);
            // Reset for next frame
            touchStartRef.current = { ...start, dist, scrollX: useEditorStore.getState().scrollX, pps: useEditorStore.getState().pixelsPerSecond };
          }
        }
      }
    },
    [navigationMode, pixelsPerSecond, pixelsPerSemitone, setScrollX, scrollVertical, zoom]
  );

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null;
  }, []);

  // Segment data for child tracks
  const phSeq = segment?.data?.phSeq ?? [];
  const phDur = segment?.data?.phDur ?? [];

  // Build word group display data from segment
  const wordGroups = React.useMemo(() => {
    if (!segment?.data) return [];

    const { wordGroups: wgs, phSeq: pSeq } = segment.data;
    return wgs.map((wg) => {
      const phSlice = pSeq.slice(wg.startPhIndex, wg.startPhIndex + wg.phCount);
      return {
        phSeq: phSlice,
        phNum: wg.phCount,
        startTime: wg.startTime,
        duration: wg.duration,
      };
    });
  }, [segment]);

  // Register wheel handler as non-passive native event (React onWheel is passive)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      handleWheel(e);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [handleWheel]);

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Time Ruler */}
      <TimeRuler
        scrollX={scrollX}
        pixelsPerSecond={pixelsPerSecond}
        width={containerWidth}
        onSeek={seekTo}
      />

      <div style={styles.trackSeparator} />

      {/* Waveform Track */}
      <WaveformTrack
        scrollX={scrollX}
        pixelsPerSecond={pixelsPerSecond}
        waveformData={waveformData}
        sampleRate={sampleRate}
        onSeek={seekTo}
      />

      <div style={styles.trackSeparator} />

      {/* Piano Roll Track (flex: 1) */}
      <PianoRollTrack />

      <div style={styles.trackSeparator} />

      {/* Phoneme Track */}
      <PhonemeTrack
        phSeq={phSeq}
        phDur={phDur}
        scrollX={scrollX}
        pixelsPerSecond={pixelsPerSecond}
      />

      <div style={styles.trackSeparator} />

      {/* Word Track */}
      <WordTrack
        wordGroups={wordGroups}
        scrollX={scrollX}
        pixelsPerSecond={pixelsPerSecond}
      />
    </div>
  );
};

export default TrackContainer;
