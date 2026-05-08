// ============================================================================
// SCRIBE - Note Merge Handler
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

/**
 * Find the WordGroup that contains a given note index.
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
 * Merge a note with the note immediately to its right.
 *
 * Constraints:
 * - The right-adjacent note must exist.
 * - Both notes must belong to the same WordGroup.
 *
 * The merged note inherits pitch from the left note.
 *
 * Returns the merged note, the removed note's id, and a success/error indicator.
 */
export function mergeNotes(
  leftNoteId: string,
  notes: Note[],
  wordGroups: WordGroup[],
): {
  mergedNote: Note;
  removedNoteId: string;
  success: boolean;
  error?: string;
} {
  const leftIndex = notes.findIndex((n) => n.id === leftNoteId);
  if (leftIndex === -1) {
    return {
      mergedNote: null as unknown as Note,
      removedNoteId: '',
      success: false,
      error: 'Left note not found',
    };
  }

  const rightIndex = leftIndex + 1;
  if (rightIndex >= notes.length) {
    return {
      mergedNote: null as unknown as Note,
      removedNoteId: '',
      success: false,
      error: 'No adjacent note to the right',
    };
  }

  const leftNote = notes[leftIndex];
  const rightNote = notes[rightIndex];

  // Validate same word group
  const leftWg = findWordGroupForNoteIndex(leftIndex, wordGroups);
  const rightWg = findWordGroupForNoteIndex(rightIndex, wordGroups);

  if (!leftWg || !rightWg) {
    return {
      mergedNote: null as unknown as Note,
      removedNoteId: '',
      success: false,
      error: 'Could not determine WordGroup for one or both notes',
    };
  }

  if (
    leftWg.noteStartIndex !== rightWg.noteStartIndex ||
    leftWg.noteCount !== rightWg.noteCount
  ) {
    return {
      mergedNote: null as unknown as Note,
      removedNoteId: '',
      success: false,
      error: 'Notes do not belong to the same WordGroup',
    };
  }

  // Merge: take left note's pitch, combine durations
  const mergedNote: Note = {
    id: leftNote.id,
    startTime: leftNote.startTime,
    duration: leftNote.duration + rightNote.duration,
    midiPitch: leftNote.midiPitch,
    centsOffset: leftNote.centsOffset,
    isRest: leftNote.isRest,
  };

  return {
    mergedNote,
    removedNoteId: rightNote.id,
    success: true,
  };
}
