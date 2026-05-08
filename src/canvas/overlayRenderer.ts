// ============================================================================
// SCRIBE - Overlay Renderer (playback cursor, box select, split preview)
// ============================================================================

export interface OverlayState {
  /** Current playback position in pixels (X), or null if not playing. */
  playbackTime: number | null;
  /** Split-preview line position in pixels (X), or null. */
  splitPreviewTime: number | null;
  /** Box-selection start corner in canvas pixels, or null. */
  boxSelectStart: { x: number; y: number } | null;
  /** Box-selection end corner in canvas pixels, or null. */
  boxSelectEnd: { x: number; y: number } | null;
  /** Rectangle of the currently hovered note (canvas pixels), or null. */
  hoveredNoteRect: { x: number; y: number; w: number; h: number } | null;
}

/**
 * Render editor overlays on top of all other layers.
 */
export function renderOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: OverlayState,
): void {
  // ------------------------------------------------------------------
  // 1. Playback cursor
  // ------------------------------------------------------------------
  if (state.playbackTime !== null) {
    ctx.save();
    ctx.strokeStyle = '#E8E5DF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(state.playbackTime, 0);
    ctx.lineTo(state.playbackTime, height);
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------
  // 2. Box-selection rectangle
  // ------------------------------------------------------------------
  if (state.boxSelectStart !== null && state.boxSelectEnd !== null) {
    const x = Math.min(state.boxSelectStart.x, state.boxSelectEnd.x);
    const y = Math.min(state.boxSelectStart.y, state.boxSelectEnd.y);
    const w = Math.abs(state.boxSelectEnd.x - state.boxSelectStart.x);
    const h = Math.abs(state.boxSelectEnd.y - state.boxSelectStart.y);

    ctx.save();

    // Fill
    ctx.fillStyle = 'rgba(86,156,224,0.08)';
    ctx.fillRect(x, y, w, h);

    // Border
    ctx.strokeStyle = '#6DB0F2';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    ctx.restore();
  }

  // ------------------------------------------------------------------
  // 3. Split preview line
  // ------------------------------------------------------------------
  if (state.splitPreviewTime !== null) {
    ctx.save();
    ctx.strokeStyle = '#6DB0F2';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(state.splitPreviewTime, 0);
    ctx.lineTo(state.splitPreviewTime, height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
