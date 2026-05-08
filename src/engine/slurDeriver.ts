import type { WordGroup } from './wordGroupDeriver';

interface Note {
  id: string;
  startTime: number;
  duration: number;
  midiPitch: number;
  centsOffset: number;
  isRest: boolean;
}

export function deriveNoteSlur(notes: Note[], wordGroups: WordGroup[]): number[] {
  const slur: number[] = new Array(notes.length).fill(0);
  for (const wg of wordGroups) {
    for (let i = 1; i < wg.noteCount; i++) {
      slur[wg.noteStartIndex + i] = 1;
    }
  }
  return slur;
}
