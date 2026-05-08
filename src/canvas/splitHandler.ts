// ============================================================================
// SCRIBE - Note Split Handler
// ============================================================================

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

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10);
}

/**
 * Split a note at the given time into two notes.
 *
 * Constraints:
 * - splitTime must be strictly within the note's time range.
 * - Both resulting segments must be >= f0Timestep in duration.
 *
 * Returns the full updated notes array with the original note replaced by two
 * new notes, plus a success/error indicator.
 */
export function splitNote(
  noteId: string,
  splitTime: number,
  notes: Note[],
  wordGroups: WordGroup[],
  f0Timestep: number,
): { newNotes: Note[]; newWordGroups: WordGroup[]; success: boolean; error?: string } {
  const noteIndex = notes.findIndex((n) => n.id === noteId);
  if (noteIndex === -1) {
    return { newNotes: notes, newWordGroups: wordGroups, success: false, error: 'Note not found' };
  }

  const note = notes[noteIndex];
  const noteEnd = note.startTime + note.duration;

  // Validate splitTime is within range
  if (splitTime <= note.startTime || splitTime >= noteEnd) {
    return {
      newNotes: notes,
      newWordGroups: wordGroups,
      success: false,
      error: 'Split time is outside the note range',
    };
  }

  const leftDuration = splitTime - note.startTime;
  const rightDuration = noteEnd - splitTime;

  // Both segments must meet the minimum duration
  if (leftDuration < f0Timestep) {
    return {
      newNotes: notes,
      newWordGroups: wordGroups,
      success: false,
      error: `Left segment too short (${leftDuration.toFixed(4)}s < ${f0Timestep}s)`,
    };
  }
  if (rightDuration < f0Timestep) {
    return {
      newNotes: notes,
      newWordGroups: wordGroups,
      success: false,
      error: `Right segment too short (${rightDuration.toFixed(4)}s < ${f0Timestep}s)`,
    };
  }

  const leftNote: Note = {
    id: generateId(),
    startTime: note.startTime,
    duration: leftDuration,
    midiPitch: note.midiPitch,
    centsOffset: note.centsOffset,
    isRest: note.isRest,
  };

  const rightNote: Note = {
    id: generateId(),
    startTime: splitTime,
    duration: rightDuration,
    midiPitch: note.midiPitch,
    centsOffset: note.centsOffset,
    isRest: note.isRest,
  };

  // Build updated notes array
  const newNotes = [
    ...notes.slice(0, noteIndex),
    leftNote,
    rightNote,
    ...notes.slice(noteIndex + 1),
  ];

  const newWordGroups = wordGroups.map((wg) => {
    if (noteIndex >= wg.noteStartIndex && noteIndex < wg.noteStartIndex + wg.noteCount) {
      return { ...wg, noteCount: wg.noteCount + 1 };
    }
    if (wg.noteStartIndex > noteIndex) {
      return { ...wg, noteStartIndex: wg.noteStartIndex + 1 };
    }
    return wg;
  });

  return { newNotes, newWordGroups, success: true };
}
