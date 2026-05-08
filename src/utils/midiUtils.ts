// ============================================================================
// SCRIBE - MIDI Utility Functions
// ============================================================================

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_KEYS = [1, 3, 6, 8, 10];

/**
 * Convert a MIDI note number (and optional cents offset) to a note name string.
 * Examples:
 *   midiToNoteName(60, 0)  === "C4"
 *   midiToNoteName(60)     === "C4"
 *   midiToNoteName(53, -3) === "F3-3"
 */
export function midiToNoteName(midi: number, cents?: number): string {
  const noteIndex = Math.round(midi) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  const name = NOTE_NAMES[noteIndex] + octave;
  if (cents !== undefined && cents !== 0) {
    // Positive cents get +, negative cents already have the minus sign
    return cents > 0 ? `${name}+${cents}` : `${name}${cents}`;
  }
  return name;
}

/**
 * Convert a MIDI note number (and optional cents offset) to frequency in Hz.
 * Formula: 440 * 2^((midi + cents/100 - 69) / 12)
 */
export function midiToFreq(midi: number, cents?: number): number {
  return 440 * Math.pow(2, (midi + (cents || 0) / 100 - 69) / 12);
}

/**
 * Convert a frequency in Hz to a MIDI note number (fractional).
 * Formula: 12 * log2(freq / 440) + 69
 */
export function freqToMidi(freq: number): number {
  return 12 * Math.log2(freq / 440) + 69;
}

/**
 * Check whether a MIDI note number corresponds to a black key on the piano.
 */
export function isBlackKey(midi: number): boolean {
  const noteIndex = Math.round(midi) % 12;
  return BLACK_KEYS.includes(noteIndex);
}

/**
 * Get the octave number for a given MIDI note.
 * MIDI 60 = C4, so octave = floor(midi / 12) - 1.
 */
export function midiToOctave(midi: number): number {
  return Math.floor(Math.round(midi) / 12) - 1;
}

const NOTE_NAME_TO_SEMITONE: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4, 'E#': 5, 'F': 5, 'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11, 'B#': 0,
};

export function noteNameToMidi(name: string): number | null {
  if (!name || name === 'rest' || name === 'SP') return null;
  const match = name.match(/^([A-Ga-g][#b]?)(-?\d+)([+-]\d+)?$/);
  if (!match) return null;
  const notePart = match[1].charAt(0).toUpperCase() + match[1].slice(1);
  const octave = parseInt(match[2], 10);
  const semitone = NOTE_NAME_TO_SEMITONE[notePart];
  if (semitone === undefined) return null;
  return (octave + 1) * 12 + semitone;
}
