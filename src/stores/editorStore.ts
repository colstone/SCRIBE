import { create } from 'zustand';
import type { EditorMode, InteractionState } from '../types';

// ============================================================================
// Editor Store
// ============================================================================

/** Clamp a value between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface EditorState {
  // --- State ---
  mode: EditorMode;
  interactionState: InteractionState;
  selectedNoteIds: Set<string>;
  hoveredNoteId: string | null;
  scrollX: number;
  pixelsPerSecond: number;
  highestMidi: number;
  lowestMidi: number;
  readonly pixelsPerSemitone: number;

  // --- Actions ---
  setMode: (mode: EditorMode) => void;
  setInteractionState: (state: InteractionState) => void;
  setScrollX: (scrollX: number) => void;
  zoom: (factor: number, mouseX: number, viewportWidth: number) => void;
  zoomToFit: (segmentDuration: number, viewportWidth: number) => void;
  selectNote: (id: string) => void;
  deselectAll: () => void;
  toggleNoteSelection: (id: string) => void;
  addToSelection: (ids: string[]) => void;
  setHoveredNote: (id: string | null) => void;
  scrollVertical: (deltaSemitones: number) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // --- State ---
  mode: 'select',
  interactionState: 'idle',
  selectedNoteIds: new Set<string>(),
  hoveredNoteId: null,
  scrollX: 0,
  pixelsPerSecond: 150,
  highestMidi: 84,
  lowestMidi: 48,
  pixelsPerSemitone: 20,

  // --- Actions ---

  setMode: (mode: EditorMode) => {
    set({ mode });
  },

  setInteractionState: (interactionState: InteractionState) => {
    set({ interactionState });
  },

  setScrollX: (scrollX: number) => {
    set({ scrollX: Math.max(0, scrollX) });
  },

  zoom: (factor: number, mouseX: number, _viewportWidth: number) => {
    const { pixelsPerSecond: pps, scrollX } = get();

    // Compute the time position under the mouse cursor
    const timeAtMouse = mouseX / pps + scrollX;

    // Apply zoom factor with clamping
    const newPps = clamp(pps * factor, 50, 1000);

    // Adjust scroll so the time under the mouse stays at the same screen position
    const newScrollX = timeAtMouse - mouseX / newPps;

    set({
      pixelsPerSecond: newPps,
      scrollX: Math.max(0, newScrollX),
    });
  },

  zoomToFit: (segmentDuration: number, viewportWidth: number) => {
    if (segmentDuration <= 0 || viewportWidth <= 0) return;

    const newPps = clamp(viewportWidth / segmentDuration, 50, 1000);

    set({
      pixelsPerSecond: newPps,
      scrollX: 0,
    });
  },

  selectNote: (id: string) => {
    set({ selectedNoteIds: new Set([id]) });
  },

  deselectAll: () => {
    set({ selectedNoteIds: new Set<string>() });
  },

  toggleNoteSelection: (id: string) => {
    const { selectedNoteIds } = get();
    const next = new Set(selectedNoteIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ selectedNoteIds: next });
  },

  addToSelection: (ids: string[]) => {
    const { selectedNoteIds } = get();
    const next = new Set(selectedNoteIds);
    for (const id of ids) {
      next.add(id);
    }
    set({ selectedNoteIds: next });
  },

  setHoveredNote: (id: string | null) => {
    set({ hoveredNoteId: id });
  },

  scrollVertical: (deltaSemitones: number) => {
    const { highestMidi, lowestMidi } = get();
    const range = highestMidi - lowestMidi;
    const newHighest = clamp(highestMidi + deltaSemitones, range, 127);
    const newLowest = newHighest - range;
    set({ highestMidi: newHighest, lowestMidi: newLowest });
  },
}));
