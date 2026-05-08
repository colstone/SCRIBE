// ============================================================================
// SCRIBE - DiffSinger Variance Dataset Annotation Tool
// Core Type Definitions
// ============================================================================

// --- F0 Configuration ---

export interface F0Config {
  hopSize: number;       // default 512
  sampleRate: number;    // default 44100
  f0Min: number;         // default 40
  f0Max: number;         // default 1100
}

// --- Project ---

export interface Project {
  name: string;
  csvPath: string;
  wavsDir: string;
  vowelList: string[];
  phNumPreset: string | null;
  f0Algorithm: 'parselmouth' | 'rmvpe' | 'fcpe';
  f0Config: F0Config;
  segments: Segment[];
  createdAt: string;
  updatedAt: string;
}

// --- Segment ---

export type SegmentStatus = 'todo' | 'wip' | 'done';

export interface Segment {
  name: string;
  wavPath: string;
  status: SegmentStatus;
  audioDuration: number;
  data: SegmentData;
  undoStack: EditAction[];
  redoStack: EditAction[];
}

export interface SegmentData {
  readonly phSeq: string[];
  readonly phDur: number[];
  phNum: number[];
  notes: Note[];
  wordGroups: WordGroup[];
  f0: Float32Array | null;
  f0Timestep: number;
  f0Modified: boolean;
  noteGlide: string[] | null;
}

// --- Note ---

export interface Note {
  id: string;
  startTime: number;
  duration: number;
  midiPitch: number;
  centsOffset: number;
  isRest: boolean;
}

// --- WordGroup ---

export interface WordGroup {
  startPhIndex: number;
  phCount: number;
  startTime: number;
  duration: number;
  noteStartIndex: number;
  noteCount: number;
}

// --- Edit Actions (Undo/Redo) ---

export interface EditAction {
  type:
    | 'pitch_change'
    | 'split_note'
    | 'merge_notes'
    | 'set_rest'
    | 'delete_note'
    | 'insert_note'
    | 'modify_ph_num'
    | 'snap_cents'
    | 'batch_pitch_change';
  timestamp: number;
  forward: () => void;
  backward: () => void;
}

// --- Editor State Types ---

export type EditorMode = 'select' | 'split' | 'merge';
export type InteractionState = 'idle' | 'dragging' | 'boxSelecting' | 'panning';

// --- Validation ---

export interface ValidationError {
  code: string;
  message: string;
  noteId?: string;
}
