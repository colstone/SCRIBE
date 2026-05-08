import React, { useRef, useEffect, useCallback, useState } from 'react';
import PianoKeys from './PianoKeys';
import NoteContextMenu from '../ContextMenus/NoteContextMenu';
import RollContextMenu from '../ContextMenus/RollContextMenu';
import { useEditorStore } from '../../stores/editorStore';
import { useProjectStore } from '../../stores/projectStore';
import { useAudioStore } from '../../stores/audioStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { renderGrid } from '../../canvas/gridRenderer';
import { renderNotes } from '../../canvas/noteRenderer';
import { renderF0 } from '../../canvas/f0Renderer';
import type { F0Smoothing } from '../../canvas/f0Renderer';
import { renderOverlay } from '../../canvas/overlayRenderer';
import { timeToPixel } from '../../canvas/coordTransform';
import { hitTestNote } from '../../canvas/hitTest';
import { midiToNoteName } from '../../utils/midiUtils';
import {
  handleMouseDown as interactionMouseDown,
  handleMouseMove as interactionMouseMove,
  handleMouseUp as interactionMouseUp,
} from '../../canvas/interactionHandlers';
import type { DragState, InteractionContext } from '../../canvas/interactionHandlers';
import { splitNote } from '../../canvas/splitHandler';
import { mergeNotes } from '../../canvas/mergeHandler';
import { estimateMidi } from '../../engine/midiEstimator';
import { SineWaveFeedback } from '../../audio/sineWave';

// ============================================================================
// PianoRollTrack - Composite track with PianoKeys + 4 layered canvases
// ============================================================================

const PIANO_KEYS_WIDTH = 48;

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'row',
    flex: 1,
    minHeight: '200px',
    overflow: 'hidden',
    position: 'relative',
  } as React.CSSProperties,

  canvasArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  } as React.CSSProperties,
};

function canvasStyle(zIndex: number): React.CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex,
  };
}

const PianoRollTrack: React.FC = () => {
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const contentCanvasRef = useRef<HTMLCanvasElement>(null);
  const f0CanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<SineWaveFeedback | null>(null);

  const getFeedback = useCallback(() => {
    if (!feedbackRef.current) {
      const ctx = new AudioContext();
      feedbackRef.current = new SineWaveFeedback(ctx);
    }
    return feedbackRef.current;
  }, []);

  // Subscribe to stores
  const scrollX = useEditorStore((s) => s.scrollX);
  const pixelsPerSecond = useEditorStore((s) => s.pixelsPerSecond);
  const highestMidi = useEditorStore((s) => s.highestMidi);
  const lowestMidi = useEditorStore((s) => s.lowestMidi);
  const pixelsPerSemitone = useEditorStore((s) => s.pixelsPerSemitone);
  const selectedNoteIds = useEditorStore((s) => s.selectedNoteIds);
  const hoveredNoteId = useEditorStore((s) => s.hoveredNoteId);

  const mode = useEditorStore((s) => s.mode);

  const segment = useProjectStore((s) => s.getCurrentSegment());
  const currentSegmentIndex = useProjectStore((s) => s.currentSegmentIndex);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentTime = useAudioStore((s) => s.currentTime);

  const f0Smoothing = useSettingsStore((s) => s.f0Smoothing) as F0Smoothing;

  // Subscribe to F0 data separately so F0 layer doesn't re-render on note changes
  const f0Data = useProjectStore((s) => s.getCurrentSegment()?.data?.f0 ?? null);
  const f0Timestep = useProjectStore((s) => s.getCurrentSegment()?.data?.f0Timestep ?? 0);

  // Drag state tracked via ref to avoid re-renders on every mouse move
  const dragStateRef = useRef<DragState>({
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    type: 'none',
  });

  // Snapshot of note pitches at drag start (id -> {midiPitch, centsOffset})
  const dragSnapshotRef = useRef<Map<string, { midi: number; cents: number }>>(new Map());

  // Overlay-specific transient state (split preview, box select rect)
  const [splitPreviewTime, setSplitPreviewTime] = useState<number | null>(null);
  const [boxSelectStart, setBoxSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [boxSelectEnd, setBoxSelectEnd] = useState<{ x: number; y: number } | null>(null);

  // Clear split preview when leaving split mode
  useEffect(() => {
    if (mode !== 'split') setSplitPreviewTime(null);
  }, [mode]);

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{
    type: 'note' | 'roll';
    x: number;
    y: number;
    noteId?: string;
    noteName?: string;
    canMerge?: boolean;
    isSlur?: boolean;
    canSetSlur?: boolean;
    isRest?: boolean;
  } | null>(null);

  // Helper to set up a canvas for high-DPI rendering
  const setupCanvas = useCallback(
    (canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null => {
      if (!canvas) return null;
      const container = containerRef.current;
      if (!container) return null;

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
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Build InteractionContext from current store state
  // ---------------------------------------------------------------------------
  const buildContext = useCallback((): InteractionContext | null => {
    if (!segment?.data) return null;
    return {
      mode,
      notes: segment.data.notes,
      wordGroups: segment.data.wordGroups,
      scrollX,
      pixelsPerSecond,
      highestMidi,
      pixelsPerSemitone,
      selectedNoteIds,
      f0Timestep: segment.data.f0Timestep,
    };
  }, [mode, segment, scrollX, pixelsPerSecond, highestMidi, pixelsPerSemitone, selectedNoteIds]);

  // ---------------------------------------------------------------------------
  // Apply a HandleResult to stores and local state
  // ---------------------------------------------------------------------------
  const applyResult = useCallback(
    (result: import('../../canvas/interactionHandlers').HandleResult) => {
      const editor = useEditorStore.getState();

      // Selection
      if (result.selectedNoteIds !== undefined) {
        // Replace the full selection set
        // Use deselectAll + addToSelection for a clean swap
        editor.deselectAll();
        const ids = Array.from(result.selectedNoteIds);
        if (ids.length > 0) {
          editor.addToSelection(ids);
        }
      }

      // Hover
      if (result.hoveredNoteId !== undefined) {
        editor.setHoveredNote(result.hoveredNoteId);
      }

      // Interaction state
      if (result.interactionState) {
        editor.setInteractionState(
          result.interactionState as 'idle' | 'dragging' | 'boxSelecting' | 'panning',
        );
      }

      // Split preview
      if (result.splitPreviewTime !== undefined) {
        setSplitPreviewTime(result.splitPreviewTime);
      }

      // Cursor
      if (result.cursor && overlayCanvasRef.current) {
        overlayCanvasRef.current.style.cursor = result.cursor;
      }

      // Note pitch drag (using snapshot for absolute pitch calculation)
      if (result.pitchDragDelta !== undefined && segment?.data) {
        const snapshot = dragSnapshotRef.current;
        if (snapshot.size > 0) {
          const updatedNotes = segment.data.notes.map((n) => {
            const orig = snapshot.get(n.id);
            if (orig !== undefined) {
              return { ...n, midiPitch: orig.midi + result.pitchDragDelta! };
            }
            return n;
          });
          useProjectStore.getState().updateSegmentData(currentSegmentIndex, { notes: updatedNotes });
        }
        if (result.commitDrag) {
          dragSnapshotRef.current = new Map();
        }
      }

      // Cents drag (shift+drag, fine pitch adjustment)
      if (result.centsDragDelta !== undefined && segment?.data) {
        const snapshot = dragSnapshotRef.current;
        if (snapshot.size > 0) {
          const updatedNotes = segment.data.notes.map((n) => {
            const orig = snapshot.get(n.id);
            if (orig !== undefined) {
              let newCents = orig.cents + result.centsDragDelta!;
              let newMidi = orig.midi;
              while (newCents >= 50) { newCents -= 100; newMidi += 1; }
              while (newCents < -50) { newCents += 100; newMidi -= 1; }
              return { ...n, midiPitch: newMidi, centsOffset: newCents };
            }
            return n;
          });
          useProjectStore.getState().updateSegmentData(currentSegmentIndex, { notes: updatedNotes });
        }
        if (result.commitDrag) {
          dragSnapshotRef.current = new Map();
        }
      }

      // Note pitch updates (from context menu actions etc.)
      if (result.noteUpdates && segment?.data) {
        const updatedNotes = segment.data.notes.map((n) => {
          const update = result.noteUpdates!.find((u) => u.id === n.id);
          if (update) {
            return { ...n, midiPitch: update.midiPitch, centsOffset: update.centsOffset };
          }
          return n;
        });
        useProjectStore.getState().updateSegmentData(currentSegmentIndex, { notes: updatedNotes });
      }

      // Split action
      if (result.splitAction && segment?.data) {
        const { noteId, splitTime } = result.splitAction;
        useProjectStore.getState().pushUndoSnapshot(currentSegmentIndex);
        const { newNotes, newWordGroups, success } = splitNote(
          noteId,
          splitTime,
          segment.data.notes,
          segment.data.wordGroups,
          segment.data.f0Timestep,
        );
        if (success) {
          useProjectStore.getState().updateSegmentData(currentSegmentIndex, { notes: newNotes, wordGroups: newWordGroups });
        }
      }

      // Merge action
      if (result.mergeAction && segment?.data) {
        const { noteId } = result.mergeAction;
        useProjectStore.getState().pushUndoSnapshot(currentSegmentIndex);
        const noteIdx = segment.data.notes.findIndex((n) => n.id === noteId);
        const { mergedNote, removedNoteId, success } = mergeNotes(
          noteId,
          segment.data.notes,
          segment.data.wordGroups,
        );
        if (success) {
          const newNotes = segment.data.notes
            .filter((n) => n.id !== noteId && n.id !== removedNoteId)
            .concat(mergedNote)
            .sort((a, b) => a.startTime - b.startTime);
          const wgs = segment.data.wordGroups;
          const findWg = (ni: number) => wgs.find((wg) => wg.noteCount > 0 && ni >= wg.noteStartIndex && ni < wg.noteStartIndex + wg.noteCount);
          const wg = findWg(noteIdx);
          const newWgs = wgs.map((w) => {
            if (w === wg) return { ...w, noteCount: w.noteCount - 1 };
            if (wg && w.noteStartIndex > wg.noteStartIndex) return { ...w, noteStartIndex: w.noteStartIndex - 1 };
            return w;
          });
          useProjectStore.getState().updateSegmentData(currentSegmentIndex, { notes: newNotes, wordGroups: newWgs });
        }
      }
    },
    [segment, currentSegmentIndex],
  );

  // ---------------------------------------------------------------------------
  // Mouse event handlers wired to the overlay canvas
  // ---------------------------------------------------------------------------
  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      setContextMenu(null);

      if (e.button === 2) return;

      const ctx = buildContext();
      if (!ctx) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const result = interactionMouseDown(mx, my, e.nativeEvent, ctx);

      // Begin drag tracking
      if (result.interactionState === 'boxSelecting') {
        dragStateRef.current = {
          active: true,
          startX: mx,
          startY: my,
          currentX: mx,
          currentY: my,
          type: 'boxSelect',
        };
        setBoxSelectStart({ x: mx, y: my });
        setBoxSelectEnd({ x: mx, y: my });
      } else if (result.interactionState === 'dragging') {
        dragStateRef.current = {
          active: true,
          startX: mx,
          startY: my,
          currentX: mx,
          currentY: my,
          type: 'noteMove',
          shiftKey: e.nativeEvent.shiftKey,
        };
        // Save original pitches for selected notes
        const snap = new Map<string, { midi: number; cents: number }>();
        const selIds = result.selectedNoteIds ?? selectedNoteIds;
        if (segment?.data) {
          for (const n of segment.data.notes) {
            if (selIds.has(n.id)) {
              snap.set(n.id, { midi: n.midiPitch, cents: n.centsOffset });
            }
          }
        }
        dragSnapshotRef.current = snap;
        useProjectStore.getState().pushUndoSnapshot(currentSegmentIndex);
      } else {
        dragStateRef.current = {
          active: false,
          startX: 0,
          startY: 0,
          currentX: 0,
          currentY: 0,
          type: 'none',
        };
        setBoxSelectStart(null);
        setBoxSelectEnd(null);
      }

      // Play note sound on click in select mode
      if (result.selectedNoteIds && result.selectedNoteIds.size > 0 && segment?.data) {
        const clickedId = Array.from(result.selectedNoteIds)[result.selectedNoteIds.size - 1];
        const note = segment.data.notes.find((n) => n.id === clickedId);
        if (note && !note.isRest) {
          getFeedback().pluck(note.midiPitch, note.centsOffset);
        }
      }

      applyResult(result);
    },
    [buildContext, applyResult],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const ctx = buildContext();
      if (!ctx) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Update drag position
      if (dragStateRef.current.active) {
        dragStateRef.current.currentX = mx;
        dragStateRef.current.currentY = my;
      }

      const result = interactionMouseMove(
        mx, my,
        ctx,
        dragStateRef.current.active ? dragStateRef.current : null,
      );

      // Update box select visual
      if (dragStateRef.current.active && dragStateRef.current.type === 'boxSelect') {
        setBoxSelectEnd({ x: mx, y: my });
      }

      applyResult(result);
    },
    [buildContext, applyResult],
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const ctx = buildContext();
      if (!ctx) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const result = interactionMouseUp(
        mx, my,
        ctx,
        dragStateRef.current.active ? dragStateRef.current : null,
      );

      // Reset drag state
      dragStateRef.current = {
        active: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        type: 'none',
      };
      setBoxSelectStart(null);
      setBoxSelectEnd(null);

      applyResult(result);
    },
    [buildContext, applyResult],
  );

  // ---------------------------------------------------------------------------
  // Render grid layer
  // ---------------------------------------------------------------------------
  const drawGrid = useCallback(() => {
    const ctx = setupCanvas(gridCanvasRef.current);
    if (!ctx) return;

    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();

    renderGrid(
      ctx,
      rect.width,
      rect.height,
      scrollX,
      pixelsPerSecond,
      highestMidi,
      lowestMidi,
      pixelsPerSemitone
    );
  }, [setupCanvas, scrollX, pixelsPerSecond, highestMidi, lowestMidi, pixelsPerSemitone]);

  // ---------------------------------------------------------------------------
  // Render content layer (notes + word group bands)
  // ---------------------------------------------------------------------------
  const drawContent = useCallback(() => {
    const ctx = setupCanvas(contentCanvasRef.current);
    if (!ctx) return;

    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();

    ctx.clearRect(0, 0, rect.width, rect.height);

    if (segment?.data) {
      renderNotes(
        ctx,
        segment.data.notes,
        segment.data.wordGroups,
        selectedNoteIds,
        hoveredNoteId,
        scrollX,
        pixelsPerSecond,
        highestMidi,
        pixelsPerSemitone
      );
    }
  }, [
    setupCanvas,
    segment,
    selectedNoteIds,
    hoveredNoteId,
    scrollX,
    pixelsPerSecond,
    highestMidi,
    pixelsPerSemitone,
  ]);

  // ---------------------------------------------------------------------------
  // Render F0 layer
  // ---------------------------------------------------------------------------
  const drawF0 = useCallback(() => {
    const ctx = setupCanvas(f0CanvasRef.current);
    if (!ctx) return;

    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();

    ctx.clearRect(0, 0, rect.width, rect.height);

    if (f0Data && f0Data.length > 0) {
      renderF0(
        ctx,
        f0Data,
        f0Timestep,
        scrollX,
        pixelsPerSecond,
        highestMidi,
        pixelsPerSemitone,
        f0Smoothing
      );
    }
  }, [setupCanvas, f0Data, f0Timestep, scrollX, pixelsPerSecond, highestMidi, pixelsPerSemitone, f0Smoothing]);

  // ---------------------------------------------------------------------------
  // Render overlay layer (playback cursor, selection, split preview)
  // ---------------------------------------------------------------------------
  const drawOverlay = useCallback(() => {
    const ctx = setupCanvas(overlayCanvasRef.current);
    if (!ctx) return;

    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();

    ctx.clearRect(0, 0, rect.width, rect.height);

    const playbackX = currentTime > 0 || isPlaying ? timeToPixel(currentTime, scrollX, pixelsPerSecond) : null;

    renderOverlay(ctx, rect.width, rect.height, {
      playbackTime: playbackX,
      splitPreviewTime: splitPreviewTime !== null
        ? timeToPixel(splitPreviewTime, scrollX, pixelsPerSecond)
        : null,
      boxSelectStart,
      boxSelectEnd,
      hoveredNoteRect: null,
    });
  }, [setupCanvas, isPlaying, currentTime, scrollX, pixelsPerSecond, splitPreviewTime, boxSelectStart, boxSelectEnd]);

  // ---------------------------------------------------------------------------
  // Effects: redraw when dependencies change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  useEffect(() => {
    drawContent();
  }, [drawContent]);

  useEffect(() => {
    drawF0();
  }, [drawF0]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  // Handle resize
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      drawGrid();
      drawContent();
      drawF0();
      drawOverlay();
    });

    const container = containerRef.current;
    if (container) {
      observer.observe(container);
    }

    return () => {
      observer.disconnect();
    };
  }, [drawGrid, drawContent, drawF0, drawOverlay]);

  // Piano key press handlers
  const handleKeyPress = useCallback((midi: number) => {
    getFeedback().pluck(midi);
  }, [getFeedback]);

  const handleKeyRelease = useCallback(() => {
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (!segment?.data) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const hit = hitTestNote(
        mx, my,
        segment.data.notes,
        scrollX, pixelsPerSecond, highestMidi, pixelsPerSemitone,
      );

      if (hit) {
        const note = segment.data.notes.find((n) => n.id === hit.id);
        const noteIndex = segment.data.notes.findIndex((n) => n.id === hit.id);
        const wgs = segment.data.wordGroups;
        const findWg = (ni: number) => wgs.find((wg) => ni >= wg.noteStartIndex && ni < wg.noteStartIndex + wg.noteCount);

        const rightIndex = noteIndex + 1;
        let canMerge = false;
        if (rightIndex < segment.data.notes.length) {
          const wgA = findWg(noteIndex);
          const wgB = findWg(rightIndex);
          canMerge = !!(wgA && wgB && wgA.noteStartIndex === wgB.noteStartIndex);
        }

        const curWg = findWg(noteIndex);
        const isSlur = !!(curWg && noteIndex > curWg.noteStartIndex);
        const canSetSlur = !isSlur && noteIndex > 0 && !!curWg && noteIndex === curWg.noteStartIndex;

        setContextMenu({
          type: 'note',
          x: e.clientX,
          y: e.clientY,
          noteId: hit.id,
          noteName: note ? midiToNoteName(note.midiPitch) : '?',
          canMerge,
          isSlur,
          canSetSlur,
          isRest: note?.isRest ?? false,
        });
      } else {
        setContextMenu({
          type: 'roll',
          x: e.clientX,
          y: e.clientY,
        });
      }
    },
    [segment, scrollX, pixelsPerSecond, highestMidi, pixelsPerSemitone],
  );

  const handleContextAction = useCallback(
    (action: string) => {
      setContextMenu(null);
      if (!segment?.data) return;

      const editor = useEditorStore.getState();
      const projStore = useProjectStore.getState();

      if (action === 'pitch_up' || action === 'pitch_down') {
        const delta = action === 'pitch_up' ? 1 : -1;
        const sel = editor.selectedNoteIds;
        if (sel.size === 0) return;
        projStore.pushUndoSnapshot(currentSegmentIndex);
        const newNotes = segment.data.notes.map((n) =>
          sel.has(n.id) ? { ...n, midiPitch: n.midiPitch + delta } : n,
        );
        projStore.updateSegmentData(currentSegmentIndex, { notes: newNotes });
      }

      if (action === 'snap_f0' && contextMenu?.noteId) {
        const { f0, f0Timestep, notes } = segment.data;
        if (!f0 || f0.length === 0) return;
        const note = notes.find((n) => n.id === contextMenu.noteId);
        if (!note || note.isRest) return;
        const wg = [{ startPhIndex: 0, phCount: 0, startTime: note.startTime, duration: note.duration, noteStartIndex: 0, noteCount: 1 }];
        const est = estimateMidi(f0, f0Timestep, wg);
        if (est.length === 0 || est[0].isRest) return;
        projStore.pushUndoSnapshot(currentSegmentIndex);
        const newNotes = notes.map((n) =>
          n.id === contextMenu.noteId ? { ...n, midiPitch: est[0].midiPitch, centsOffset: est[0].centsOffset } : n,
        );
        projStore.updateSegmentData(currentSegmentIndex, { notes: newNotes });
      }

      if (action === 'set_rest' && contextMenu?.noteId) {
        projStore.pushUndoSnapshot(currentSegmentIndex);
        const newNotes = segment.data.notes.map((n) =>
          n.id === contextMenu.noteId ? { ...n, isRest: true } : n,
        );
        projStore.updateSegmentData(currentSegmentIndex, { notes: newNotes });
      }

      if (action === 'unset_rest' && contextMenu?.noteId) {
        const { f0, f0Timestep, notes } = segment.data;
        const note = notes.find((n) => n.id === contextMenu.noteId);
        if (!note) return;
        projStore.pushUndoSnapshot(currentSegmentIndex);
        let midiPitch = 60;
        let centsOffset = 0;
        if (f0 && f0.length > 0) {
          const wg = [{ startPhIndex: 0, phCount: 0, startTime: note.startTime, duration: note.duration, noteStartIndex: 0, noteCount: 1 }];
          const est = estimateMidi(f0, f0Timestep, wg);
          if (est.length > 0 && !est[0].isRest) {
            midiPitch = est[0].midiPitch;
            centsOffset = est[0].centsOffset;
          }
        }
        const newNotes = notes.map((n) =>
          n.id === contextMenu.noteId ? { ...n, isRest: false, midiPitch, centsOffset } : n,
        );
        projStore.updateSegmentData(currentSegmentIndex, { notes: newNotes });
      }

      if (action === 'split' && contextMenu?.noteId) {
        const note = segment.data.notes.find((n) => n.id === contextMenu.noteId);
        if (note) {
          projStore.pushUndoSnapshot(currentSegmentIndex);
          const splitTime = note.startTime + note.duration / 2;
          const { newNotes, newWordGroups, success } = splitNote(
            contextMenu.noteId, splitTime,
            segment.data.notes, segment.data.wordGroups, segment.data.f0Timestep,
          );
          if (success) {
            projStore.updateSegmentData(currentSegmentIndex, { notes: newNotes, wordGroups: newWordGroups });
          }
        }
      }

      if (action === 'merge' && contextMenu?.noteId) {
        projStore.pushUndoSnapshot(currentSegmentIndex);
        const { mergedNote, removedNoteId, success } = mergeNotes(
          contextMenu.noteId, segment.data.notes, segment.data.wordGroups,
        );
        if (success) {
          const newNotes = segment.data.notes
            .filter((n) => n.id !== contextMenu.noteId && n.id !== removedNoteId)
            .concat(mergedNote)
            .sort((a, b) => a.startTime - b.startTime);
          const noteIdx = segment.data.notes.findIndex((n) => n.id === contextMenu.noteId);
          const wgs = segment.data.wordGroups;
          const findWg = (ni: number) => wgs.find((wg) => ni >= wg.noteStartIndex && ni < wg.noteStartIndex + wg.noteCount);
          const wg = findWg(noteIdx);
          const newWgs = wgs.map((w) => {
            if (w === wg) return { ...w, noteCount: w.noteCount - 1 };
            if (wg && w.noteStartIndex > wg.noteStartIndex) return { ...w, noteStartIndex: w.noteStartIndex - 1 };
            return w;
          });
          projStore.updateSegmentData(currentSegmentIndex, { notes: newNotes, wordGroups: newWgs });
        }
      }

      if (action === 'set_slur' && contextMenu?.noteId) {
        const { notes, wordGroups } = segment.data;
        const noteIndex = notes.findIndex((n) => n.id === contextMenu.noteId);
        if (noteIndex <= 0) return;
        const findWg = (ni: number) => wordGroups.findIndex((wg) => ni >= wg.noteStartIndex && ni < wg.noteStartIndex + wg.noteCount);
        const curWgIdx = findWg(noteIndex);
        const prevWgIdx = findWg(noteIndex - 1);
        if (curWgIdx < 0 || prevWgIdx < 0 || curWgIdx === prevWgIdx) return;

        projStore.pushUndoSnapshot(currentSegmentIndex);
        const newWgs = wordGroups.map((wg, i) => {
          if (i === prevWgIdx) return { ...wg, noteCount: wg.noteCount + 1 };
          if (i === curWgIdx) return { ...wg, noteStartIndex: wg.noteStartIndex + 1, noteCount: wg.noteCount - 1 };
          return wg;
        });
        projStore.updateSegmentData(currentSegmentIndex, { wordGroups: newWgs });
      }

      if (action === 'unset_slur' && contextMenu?.noteId) {
        const { notes, wordGroups } = segment.data;
        const noteIndex = notes.findIndex((n) => n.id === contextMenu.noteId);
        if (noteIndex < 0) return;
        const wgIdx = wordGroups.findIndex((wg) => noteIndex >= wg.noteStartIndex && noteIndex < wg.noteStartIndex + wg.noteCount);
        if (wgIdx < 0) return;
        const wg = wordGroups[wgIdx];
        if (noteIndex <= wg.noteStartIndex) return;

        projStore.pushUndoSnapshot(currentSegmentIndex);
        const splitOffset = noteIndex - wg.noteStartIndex;
        const tailCount = wg.noteCount - splitOffset;
        const tailNote = notes[noteIndex];
        const lastTailNote = notes[Math.min(noteIndex + tailCount - 1, notes.length - 1)];
        const shrunkWg = { ...wg, noteCount: splitOffset };
        const newWg = {
          startPhIndex: wg.startPhIndex + wg.phCount,
          phCount: 0,
          startTime: tailNote.startTime,
          duration: lastTailNote.startTime + lastTailNote.duration - tailNote.startTime,
          noteStartIndex: noteIndex,
          noteCount: tailCount,
        };
        const newWgs = [
          ...wordGroups.slice(0, wgIdx),
          shrunkWg,
          newWg,
          ...wordGroups.slice(wgIdx + 1),
        ];
        projStore.updateSegmentData(currentSegmentIndex, { wordGroups: newWgs });
      }

      if (action === 'zoom_in') {
        useEditorStore.getState().zoom(1.25, 0, 0);
      }
      if (action === 'zoom_out') {
        useEditorStore.getState().zoom(0.8, 0, 0);
      }
      if (action === 'zoom_fit' && segment) {
        const width = containerRef.current?.getBoundingClientRect().width ?? window.innerWidth - 200;
        useEditorStore.getState().zoomToFit(segment.audioDuration, width);
      }
    },
    [segment, currentSegmentIndex, contextMenu],
  );

  return (
    <div style={styles.container}>
      <PianoKeys
        highestMidi={highestMidi}
        lowestMidi={lowestMidi}
        pixelsPerSemitone={pixelsPerSemitone}
        onKeyPress={handleKeyPress}
        onKeyRelease={handleKeyRelease}
      />
      <div ref={containerRef} style={styles.canvasArea as React.CSSProperties}>
        <canvas ref={gridCanvasRef} style={canvasStyle(0)} />
        <canvas ref={f0CanvasRef} style={canvasStyle(1)} />
        <canvas ref={contentCanvasRef} style={canvasStyle(2)} />
        <canvas
          ref={overlayCanvasRef}
          style={canvasStyle(3)}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onContextMenu={handleContextMenu}
        />
      </div>

      {contextMenu?.type === 'note' && contextMenu.noteId && (
        <NoteContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          noteId={contextMenu.noteId}
          noteName={contextMenu.noteName ?? '?'}
          canMerge={contextMenu.canMerge ?? false}
          isSlur={contextMenu.isSlur ?? false}
          canSetSlur={contextMenu.canSetSlur ?? false}
          isRest={contextMenu.isRest ?? false}
          onAction={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}

      {contextMenu?.type === 'roll' && (
        <RollContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onAction={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default PianoRollTrack;
