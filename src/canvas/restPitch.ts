interface NoteWithPitch {
  midiPitch: number;
  centsOffset: number;
  isRest: boolean;
}

export function getRestDisplayPitch(index: number, notes: NoteWithPitch[]): { midiPitch: number; centsOffset: number } {
  const fallback = { midiPitch: notes[index].midiPitch, centsOffset: notes[index].centsOffset };

  // Left neighbor first (rest = tail of previous phrase)
  for (let i = index - 1; i >= 0; i--) {
    if (!notes[i].isRest) return { midiPitch: notes[i].midiPitch, centsOffset: notes[i].centsOffset };
  }
  // No left neighbor → right neighbor (rest at start)
  for (let i = index + 1; i < notes.length; i++) {
    if (!notes[i].isRest) return { midiPitch: notes[i].midiPitch, centsOffset: notes[i].centsOffset };
  }
  return fallback;
}
