// ============================================================================
// SCRIBE - Waveform Renderer
// ============================================================================

import { timeToPixel } from './coordTransform';

// ---------------------------------------------------------------------------
// Envelope pre-computation
// ---------------------------------------------------------------------------

export interface WaveformEnvelope {
  min: Float32Array;
  max: Float32Array;
  samplesPerPixel: number;
}

/**
 * Pre-compute a min/max envelope from raw audio samples.
 *
 * The envelope resolution is based on a default of 150 pixels per second,
 * so `samplesPerPixel = sampleRate / 150`.
 */
export function precomputeEnvelope(
  samples: Float32Array,
  sampleRate: number,
): WaveformEnvelope {
  const pixelsPerSecond = 150;
  const samplesPerPixel = Math.max(1, Math.floor(sampleRate / pixelsPerSecond));
  const columnCount = Math.ceil(samples.length / samplesPerPixel);

  const min = new Float32Array(columnCount);
  const max = new Float32Array(columnCount);

  for (let col = 0; col < columnCount; col++) {
    const start = col * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, samples.length);

    let lo = Infinity;
    let hi = -Infinity;

    for (let j = start; j < end; j++) {
      const v = samples[j];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }

    min[col] = lo;
    max[col] = hi;
  }

  return { min, max, samplesPerPixel };
}

// ---------------------------------------------------------------------------
// Waveform rendering
// ---------------------------------------------------------------------------

/**
 * Render a waveform from a pre-computed min/max envelope.
 *
 * Draws a center line and vertical min-to-max bars for each column.
 */
export function renderWaveform(
  ctx: CanvasRenderingContext2D,
  envelope: WaveformEnvelope,
  scrollX: number,
  pps: number,
  width: number,
  height: number,
): void {
  const halfHeight = height / 2;

  // Center line
  ctx.strokeStyle = '#2A2926';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, halfHeight);
  ctx.lineTo(width, halfHeight);
  ctx.stroke();

  // Waveform
  ctx.save();
  ctx.strokeStyle = '#A09D96';
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1;

  const { min, max, samplesPerPixel } = envelope;
  // The envelope was computed at 150 px/s resolution.
  // Each column index represents (samplesPerPixel / sampleRate) seconds of audio.
  // We need to know the original sample rate to convert column index to time.
  // Since samplesPerPixel = sampleRate / 150, each column spans 1/150 seconds.
  const secondsPerColumn = 1 / 150;

  // Determine which columns are visible
  const startCol = Math.max(0, Math.floor(scrollX / secondsPerColumn) - 1);
  const endCol = Math.min(
    min.length - 1,
    Math.ceil((scrollX + width / pps) / secondsPerColumn) + 1,
  );

  ctx.beginPath();

  for (let col = startCol; col <= endCol; col++) {
    const time = col * secondsPerColumn;
    const x = timeToPixel(time, scrollX, pps);

    // Skip columns outside the visible pixel range
    if (x < -1 || x > width + 1) continue;

    const yMin = halfHeight - max[col] * halfHeight; // max sample -> top
    const yMax = halfHeight - min[col] * halfHeight; // min sample -> bottom

    ctx.moveTo(x, yMin);
    ctx.lineTo(x, yMax);
  }

  ctx.stroke();
  ctx.restore();
}
