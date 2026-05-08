// ============================================================================
// SCRIBE - Canvas Interaction Handlers
// ============================================================================

import { hitTestNote } from './hitTest';
import { pixelToTime } from './coordTransform';
import { getRestDisplayPitch } from './restPitch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Note {
  id: string;
  startTime: number;
  duration: number;
  midiPitch: number;
  centsOffset: number;
  isRest: boolean;
}

export interface WordGroup {
  startPhIndex: number;
  phCount: number;
  startTime: number;
  duration: number;
  noteStartIndex: number;
  noteCount: number;
}

export interface InteractionContext {
  mode: 'select' | 'split' | 'merge';
  notes: Note[];
  wordGroups: WordGroup[];
  scrollX: number;
  pixelsPerSecond: number;
  highestMidi: number;
  pixelsPerSemitone: number;
  selectedNoteIds: Set<string>;
  f0Timestep: number;
}

export interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  type: 'none' | 'boxSelect' | 'noteMove';
  draggedNoteId?: string;
  shiftKey?: boolean;
}

export interface HandleResult {
  selectedNoteIds?: Set<string>;
  hoveredNoteId?: string | null;
  interactionState?: string;
  splitPreviewTime?: number | null;
  cursor?: string;
  noteUpdates?: { id: string; midiPitch: number; centsOffset: number }[];
  pitchDragDelta?: number;
  centsDragDelta?: number;
  commitDrag?: boolean;
  splitAction?: { noteId: string; splitTime: number };
  mergeAction?: { noteId: string };
  needsRedraw?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a note whose time range contains the given time.
 */
function findNoteAtTime(time: number, notes: Note[]): Note | null {
  for (const note of notes) {
    if (time > note.startTime && time < note.startTime + note.duration) {
      return note;
    }
  }
  return null;
}

/**
 * Find the WordGroup that owns a given note index.
 */
function findWordGroupForNoteIndex(
  noteIndex: number,
  wordGroups: WordGroup[],
): WordGroup | null {
  for (const wg of wordGroups) {
    const start = wg.noteStartIndex;
    const end = start + wg.noteCount;
    if (noteIndex >= start && noteIndex < end) {
      return wg;
    }
  }
  return null;
}

/**
 * Check whether two note indices belong to the same WordGroup.
 */
function sameWordGroup(
  indexA: number,
  indexB: number,
  wordGroups: WordGroup[],
): boolean {
  const wgA = findWordGroupForNoteIndex(indexA, wordGroups);
  const wgB = findWordGroupForNoteIndex(indexB, wordGroups);
  if (!wgA || !wgB) return false;
  return (
    wgA.noteStartIndex === wgB.noteStartIndex &&
    wgA.noteCount === wgB.noteCount
  );
}

/**
 * Build a Set of note IDs that fall inside a rectangular pixel region.
 */
function boxSelectNotes(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ctx: InteractionContext,
): Set<string> {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  const ids = new Set<string>();

  for (let i = 0; i < ctx.notes.length; i++) {
    const note = ctx.notes[i];
    const noteX = (note.startTime - ctx.scrollX) * ctx.pixelsPerSecond;
    const noteW = note.duration * ctx.pixelsPerSecond;
    const displayMidi = note.isRest ? getRestDisplayPitch(i, ctx.notes).midiPitch : note.midiPitch;
    const noteY =
      (ctx.highestMidi - displayMidi) * ctx.pixelsPerSemitone + 1;
    const noteH = ctx.pixelsPerSemitone - 2;

    // Check overlap
    if (
      noteX + noteW >= minX &&
      noteX <= maxX &&
      noteY + noteH >= minY &&
      noteY <= maxY
    ) {
      ids.add(note.id);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Mouse Down
// ---------------------------------------------------------------------------

export function handleMouseDown(
  mx: number,
  my: number,
  e: MouseEvent,
  ctx: InteractionContext,
): HandleResult {

  const hit = hitTestNote(
    mx,
    my,
    ctx.notes,
    ctx.scrollX,
    ctx.pixelsPerSecond,
    ctx.highestMidi,
    ctx.pixelsPerSemitone,
  );

  // ----- Select mode -----
  if (ctx.mode === 'select') {
    if (hit) {
      // Ctrl+click: toggle selection
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(ctx.selectedNoteIds);
        if (next.has(hit.id)) {
          next.delete(hit.id);
        } else {
          next.add(hit.id);
        }
        return {
          selectedNoteIds: next,
          interactionState: 'idle',
          cursor: 'grab',
          needsRedraw: true,
        };
      }

      // Regular click: select only this note
      return {
        selectedNoteIds: new Set([hit.id]),
        interactionState: 'dragging',
        cursor: 'grabbing',
        needsRedraw: true,
      };
    }

    // Click on empty: start box select
    return {
      selectedNoteIds: new Set<string>(),
      interactionState: 'boxSelecting',
      cursor: 'default',
      needsRedraw: true,
    };
  }

  // ----- Split mode -----
  if (ctx.mode === 'split') {
    const splitTime = pixelToTime(mx, ctx.scrollX, ctx.pixelsPerSecond);
    const target = hit ?? findNoteAtTime(splitTime, ctx.notes);
    if (target) {
      return {
        splitAction: { noteId: target.id, splitTime },
        splitPreviewTime: null,
        interactionState: 'idle',
        cursor: 'crosshair',
        needsRedraw: true,
      };
    }
    return { cursor: 'crosshair' };
  }

  // ----- Merge mode -----
  if (ctx.mode === 'merge') {
    if (hit) {
      const noteIndex = ctx.notes.findIndex((n) => n.id === hit.id);
      const rightIndex = noteIndex + 1;

      if (rightIndex < ctx.notes.length) {
        if (sameWordGroup(noteIndex, rightIndex, ctx.wordGroups)) {
          return {
            mergeAction: { noteId: hit.id },
            interactionState: 'idle',
            cursor: 'pointer',
            needsRedraw: true,
          };
        }
      }
      // Cannot merge
      return { cursor: 'not-allowed' };
    }
    return { cursor: 'not-allowed' };
  }

  return {};
}

// ---------------------------------------------------------------------------
// Mouse Move
// ---------------------------------------------------------------------------

export function handleMouseMove(
  mx: number,
  my: number,
  ctx: InteractionContext,
  dragState: DragState | null,
): HandleResult {

  const hit = hitTestNote(
    mx,
    my,
    ctx.notes,
    ctx.scrollX,
    ctx.pixelsPerSecond,
    ctx.highestMidi,
    ctx.pixelsPerSemitone,
  );

  // ----- Select mode -----
  if (ctx.mode === 'select') {
    // Box-selecting
    if (dragState?.active && dragState.type === 'boxSelect') {
      const boxIds = boxSelectNotes(
        dragState.startX,
        dragState.startY,
        mx,
        my,
        ctx,
      );
      return {
        selectedNoteIds: boxIds,
        interactionState: 'boxSelecting',
        cursor: 'default',
        needsRedraw: true,
      };
    }

    // Note dragging — pitch or cents depending on shift
    if (dragState?.active && dragState.type === 'noteMove') {
      const deltaY = my - dragState.startY;

      if (dragState.shiftKey) {
        const deltaCents = -Math.round(deltaY * 2);
        return {
          centsDragDelta: deltaCents,
          interactionState: 'dragging',
          cursor: 'grabbing',
          needsRedraw: true,
        };
      }

      const deltaSemitones = -Math.round(deltaY / ctx.pixelsPerSemitone);
      return {
        pitchDragDelta: deltaSemitones,
        interactionState: 'dragging',
        cursor: 'grabbing',
        needsRedraw: true,
      };
    }

    // Hovering
    return {
      hoveredNoteId: hit ? hit.id : null,
      cursor: hit ? 'grab' : 'default',
    };
  }

  // ----- Split mode -----
  if (ctx.mode === 'split') {
    const splitTime = pixelToTime(mx, ctx.scrollX, ctx.pixelsPerSecond);
    return {
      hoveredNoteId: hit ? hit.id : null,
      splitPreviewTime: splitTime,
      cursor: 'crosshair',
      needsRedraw: true,
    };
  }

  // ----- Merge mode -----
  if (ctx.mode === 'merge') {
    if (hit) {
      const noteIndex = ctx.notes.findIndex((n) => n.id === hit.id);
      const rightIndex = noteIndex + 1;
      const canMerge =
        rightIndex < ctx.notes.length &&
        sameWordGroup(noteIndex, rightIndex, ctx.wordGroups);

      return {
        hoveredNoteId: hit.id,
        cursor: canMerge ? 'pointer' : 'not-allowed',
      };
    }
    return {
      hoveredNoteId: null,
      cursor: 'not-allowed',
    };
  }

  return {};
}

// ---------------------------------------------------------------------------
// Mouse Up
// ---------------------------------------------------------------------------

export function handleMouseUp(
  mx: number,
  my: number,
  ctx: InteractionContext,
  dragState: DragState | null,
): HandleResult {

  if (ctx.mode === 'select') {
    // Finish box-select
    if (dragState?.active && dragState.type === 'boxSelect') {
      const boxIds = boxSelectNotes(
        dragState.startX,
        dragState.startY,
        mx,
        my,
        ctx,
      );
      return {
        selectedNoteIds: boxIds,
        interactionState: 'idle',
        cursor: 'default',
        needsRedraw: true,
      };
    }

    // Finish note drag
    if (dragState?.active && dragState.type === 'noteMove') {
      const deltaY = my - dragState.startY;

      if (dragState.shiftKey) {
        const deltaCents = -Math.round(deltaY * 2);
        return {
          centsDragDelta: deltaCents,
          commitDrag: true,
          interactionState: 'idle',
          cursor: 'default',
          needsRedraw: true,
        };
      }

      const deltaSemitones = -Math.round(deltaY / ctx.pixelsPerSemitone);
      return {
        pitchDragDelta: deltaSemitones,
        commitDrag: true,
        interactionState: 'idle',
        cursor: 'default',
        needsRedraw: true,
      };
    }

    return {
      interactionState: 'idle',
      cursor: 'default',
    };
  }

  return {
    interactionState: 'idle',
  };
}
