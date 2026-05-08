// ============================================================================
// SCRIBE - Hit Testing for Notes
// ============================================================================

import { timeToPixel, midiToPixelY } from './coordTransform';
import { getRestDisplayPitch } from './restPitch';

interface Note {
  id: string;
  startTime: number;
  duration: number;
  midiPitch: number;
  centsOffset: number;
  isRest: boolean;
}

/**
 * Determine which note (if any) is under the given mouse coordinates.
 *
 * Notes are tested in reverse order so that later-drawn (visually on top)
 * notes take priority.
 *
 * Returns the matched Note, or null if no note is hit.
 */
export function hitTestNote(
  mouseX: number,
  mouseY: number,
  notes: Note[],
  scrollX: number,
  pps: number,
  highestMidi: number,
  pixelsPerSemitone: number,
): Note | null {
  // Iterate in reverse so that notes drawn last (on top) are tested first
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i];

    const x = timeToPixel(note.startTime, scrollX, pps);
    const w = note.duration * pps;
    let midi = note.midiPitch;
    if (note.isRest) {
      midi = getRestDisplayPitch(i, notes).midiPitch;
    }
    const y = midiToPixelY(midi, highestMidi, pixelsPerSemitone) + 1;
    const h = pixelsPerSemitone - 2;

    if (mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + h) {
      return note;
    }
  }

  return null;
}
