// ============================================================================
// SCRIBE - Piano Roll Grid Renderer
// ============================================================================

import { isBlackKey } from '../utils/midiUtils';
import { midiToPixelY } from './coordTransform';

/**
 * Render the piano-roll background grid.
 *
 * Draws:
 *  - A dark background fill
 *  - Alternating row shading for black-key rows
 *  - Thin semitone separator lines
 *  - Thicker separator lines on C notes (octave boundaries)
 *
 * Only rows visible within the viewport are drawn.
 */
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scrollX: number,
  pps: number,
  highestMidi: number,
  lowestMidi: number,
  pixelsPerSemitone: number,
): void {
  // Background fill
  ctx.fillStyle = '#1A1918';
  ctx.fillRect(0, 0, width, height);

  // Iterate over every semitone from highestMidi down to lowestMidi
  for (let midi = highestMidi; midi >= lowestMidi; midi--) {
    const y = midiToPixelY(midi, highestMidi, pixelsPerSemitone);

    // Skip rows that are entirely outside the viewport
    if (y + pixelsPerSemitone < 0) continue;
    if (y > height) continue;

    // Black-key row shading
    if (isBlackKey(midi)) {
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(0, y, width, pixelsPerSemitone);
    }

    // Separator line at the bottom edge of each row
    const lineY = y + pixelsPerSemitone;

    // Determine if this is a C note boundary (the line below note midi
    // corresponds to the boundary between midi and midi-1; if midi is C,
    // draw a stronger line).
    const isCBoundary = (midi % 12) === 0;

    if (isCBoundary) {
      ctx.strokeStyle = '#3D3A36';
      ctx.lineWidth = 1;
    } else {
      ctx.strokeStyle = '#2A2926';
      ctx.lineWidth = 0.5;
    }

    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(width, lineY);
    ctx.stroke();
  }
}
