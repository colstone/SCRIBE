// ============================================================================
// SCRIBE - Coordinate Transform Utilities
// ============================================================================

/**
 * Convert a time value (seconds) to pixel X coordinate.
 */
export function timeToPixel(time: number, scrollX: number, pps: number): number {
  return (time - scrollX) * pps;
}

/**
 * Convert a pixel X coordinate back to time (seconds).
 */
export function pixelToTime(px: number, scrollX: number, pps: number): number {
  return px / pps + scrollX;
}

/**
 * Convert a MIDI note number to pixel Y coordinate.
 * Higher MIDI values appear higher on screen (lower Y).
 */
export function midiToPixelY(midi: number, highestMidi: number, pps: number): number {
  return (highestMidi - midi) * pps;
}

/**
 * Convert a pixel Y coordinate back to a MIDI note number.
 */
export function pixelYToMidi(py: number, highestMidi: number, pps: number): number {
  return highestMidi - py / pps;
}
