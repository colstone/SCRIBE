// ============================================================================
// SCRIBE - Note Renderer
// ============================================================================

import { midiToNoteName } from '../utils/midiUtils';
import { timeToPixel, midiToPixelY } from './coordTransform';
import { getRestDisplayPitch } from './restPitch';

// Inline interface types so this module is self-contained even if types
// haven't been created yet.

interface Note {
  id: string;
  startTime: number;
  duration: number;
  midiPitch: number;
  centsOffset: number;
  isRest: boolean;
}

interface WordGroup {
  startTime: number;
  duration: number;
  noteStartIndex: number;
  noteCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Draw a rounded rectangle path (polyfill for environments without roundRect). */
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (w < 0 || h < 0) return;
  r = Math.min(r, w / 2, h / 2);
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

/** Determine if a note at `noteIndex` inside its WordGroup is a slur (position > 0). */
function isSlurNote(noteIndex: number, wordGroups: WordGroup[]): boolean {
  for (const wg of wordGroups) {
    if (
      noteIndex >= wg.noteStartIndex &&
      noteIndex < wg.noteStartIndex + wg.noteCount
    ) {
      return noteIndex > wg.noteStartIndex;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Render all notes (and word-group colour bands) onto the canvas.
 */
export function renderNotes(
  ctx: CanvasRenderingContext2D,
  notes: Note[],
  wordGroups: WordGroup[],
  selectedIds: Set<string>,
  hoveredId: string | null,
  scrollX: number,
  pps: number,
  highestMidi: number,
  pixelsPerSemitone: number,
): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  // ------------------------------------------------------------------
  // 1. Word-group colour bands (alternating blue / green tint)
  // ------------------------------------------------------------------
  for (let i = 0; i < wordGroups.length; i++) {
    const wg = wordGroups[i];
    const x = timeToPixel(wg.startTime, scrollX, pps);
    const w = wg.duration * pps;

    // Skip if entirely outside viewport
    if (x + w < 0 || x > width) continue;

    ctx.fillStyle =
      i % 2 === 0
        ? 'rgba(86,156,224,0.04)' // odd word (0-indexed even = 1st word = "odd" in 1-based)
        : 'rgba(93,202,165,0.04)'; // even word
    ctx.fillRect(x, 0, w, height);
  }

  // ------------------------------------------------------------------
  // 2. Individual notes
  // ------------------------------------------------------------------
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const x = timeToPixel(note.startTime, scrollX, pps);
    const w = note.duration * pps;

    // Skip notes outside the viewport
    if (x + w < 0 || x > width) continue;

    let displayMidi = note.midiPitch;
    let displayCents = note.centsOffset;
    if (note.isRest) {
      const rp = getRestDisplayPitch(i, notes);
      displayMidi = rp.midiPitch;
      displayCents = rp.centsOffset;
    }
    const midiWithCents = displayMidi + displayCents / 100;
    const y = midiToPixelY(midiWithCents, highestMidi, pixelsPerSemitone) + 1;
    const h = pixelsPerSemitone - 2;
    const isSelected = selectedIds.has(note.id);
    const isHovered = note.id === hoveredId;
    const slur = !note.isRest && isSlurNote(i, wordGroups);

    // --- Fill + border ---
    ctx.save();

    if (note.isRest) {
      // Rest note
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      drawRoundRect(ctx, x, y, w, h, 3);
      ctx.fill();

      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1.5;
      drawRoundRect(ctx, x, y, w, h, 3);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (slur) {
      // Slur note
      ctx.fillStyle = 'rgba(86,156,224,0.08)';
      drawRoundRect(ctx, x, y, w, h, 3);
      ctx.fill();

      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(86,156,224,0.3)';
      ctx.lineWidth = 1.5;
      drawRoundRect(ctx, x, y, w, h, 3);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // Normal note
      ctx.fillStyle = 'rgba(86,156,224,0.18)';
      drawRoundRect(ctx, x, y, w, h, 3);
      ctx.fill();

      ctx.strokeStyle = 'rgba(86,156,224,0.5)';
      ctx.lineWidth = 1.5;
      drawRoundRect(ctx, x, y, w, h, 3);
      ctx.stroke();
    }

    // --- Selected state: extra outer border ---
    if (isSelected) {
      ctx.strokeStyle = '#6DB0F2';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      drawRoundRect(ctx, x - 1, y - 1, w + 2, h + 2, 4);
      ctx.stroke();
    }

    // --- Hovered state ---
    if (isHovered && !isSelected) {
      ctx.strokeStyle = 'rgba(86,156,224,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      drawRoundRect(ctx, x - 1, y - 1, w + 2, h + 2, 4);
      ctx.stroke();
    }

    // --- Label ---
    const label = note.isRest
      ? 'rest'
      : midiToNoteName(note.midiPitch, note.centsOffset);

    ctx.font = '500 9px monospace';
    const textWidth = ctx.measureText(label).width;

    if (w >= textWidth + 4) {
      ctx.fillStyle = note.isRest
        ? 'rgba(255,255,255,0.35)'
        : 'rgba(255,255,255,0.7)';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 3, y + h / 2);
    }

    // --- Frequency reference line (for cents-offset notes when selected) ---
    if (isSelected && !note.isRest && note.centsOffset !== 0) {
      const refY = midiToPixelY(midiWithCents, highestMidi, pixelsPerSemitone) + pixelsPerSemitone / 2;
      ctx.strokeStyle = 'rgba(240,153,123,0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(x, refY);
      ctx.lineTo(x + w, refY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
}
