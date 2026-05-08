// ============================================================================
// SCRIBE - F0 (Fundamental Frequency) Renderer
// ============================================================================

import { timeToPixel, midiToPixelY } from './coordTransform';

export type F0Smoothing = 'none' | 'linear' | 'bezier' | 'catmull-rom' | 'cubic' | 'quartic';

interface F0Point {
  x: number;
  y: number;
}

function freqToMidi(freq: number): number {
  return 12 * Math.log2(freq / 440) + 69;
}

/**
 * Collect voiced segments as arrays of screen-space points.
 * Each segment is a contiguous run of voiced frames (f0 > 0).
 */
function collectSegments(
  f0: Float32Array,
  timestep: number,
  startFrame: number,
  endFrame: number,
  scrollX: number,
  pps: number,
  highestMidi: number,
  pixelsPerSemitone: number,
): F0Point[][] {
  const segments: F0Point[][] = [];
  let current: F0Point[] = [];

  for (let i = startFrame; i <= endFrame; i++) {
    const freq = f0[i];
    if (freq === 0) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      continue;
    }
    const midi = freqToMidi(freq);
    const x = timeToPixel(i * timestep, scrollX, pps);
    const y = midiToPixelY(midi, highestMidi, pixelsPerSemitone) + pixelsPerSemitone / 2;
    current.push({ x, y });
  }
  if (current.length > 0) {
    segments.push(current);
  }
  return segments;
}

function drawNone(ctx: CanvasRenderingContext2D, pts: F0Point[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.stroke();
}

function drawLinear(ctx: CanvasRenderingContext2D, pts: F0Point[]): void {
  drawNone(ctx, pts);
}

function drawBezier(ctx: CanvasRenderingContext2D, pts: F0Point[]): void {
  if (pts.length < 2) { drawNone(ctx, pts); return; }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
    return;
  }

  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function drawCatmullRom(ctx: CanvasRenderingContext2D, pts: F0Point[], alpha: number = 0.5): void {
  if (pts.length < 2) { drawNone(ctx, pts); return; }
  if (pts.length === 2) { drawNone(ctx, pts); return; }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  const tension = alpha;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / (6 * tension);
    const cp1y = p1.y + (p2.y - p0.y) / (6 * tension);
    const cp2x = p2.x - (p3.x - p1.x) / (6 * tension);
    const cp2y = p2.y - (p3.y - p1.y) / (6 * tension);

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  ctx.stroke();
}

function bsplineEval(pts: F0Point[], degree: number, steps: number): F0Point[] {
  const n = pts.length;
  if (n <= degree) return pts;

  // Clamped uniform knot vector
  const m = n + degree + 1;
  const knots = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    if (i <= degree) knots[i] = 0;
    else if (i >= m - degree - 1) knots[i] = n - degree;
    else knots[i] = i - degree;
  }

  const result: F0Point[] = [];
  const tMax = n - degree;

  // De Boor's algorithm (iterative)
  for (let s = 0; s <= steps; s++) {
    let t = (s / steps) * tMax;
    if (t >= tMax) t = tMax - 1e-10;

    // Find knot span k such that knots[k] <= t < knots[k+1]
    let k = degree;
    for (let i = degree; i < n; i++) {
      if (t >= knots[i] && t < knots[i + 1]) { k = i; break; }
    }

    // Copy the relevant control points
    const dx = new Float64Array(degree + 1);
    const dy = new Float64Array(degree + 1);
    for (let i = 0; i <= degree; i++) {
      const idx = k - degree + i;
      dx[i] = pts[idx].x;
      dy[i] = pts[idx].y;
    }

    // Triangular computation
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const left = k - degree + j;
        const denom = knots[left + degree - r + 1] - knots[left];
        if (denom > 0) {
          const alpha = (t - knots[left]) / denom;
          dx[j] = (1 - alpha) * dx[j - 1] + alpha * dx[j];
          dy[j] = (1 - alpha) * dy[j - 1] + alpha * dy[j];
        }
      }
    }

    result.push({ x: dx[degree], y: dy[degree] });
  }
  return result;
}

function drawBspline(ctx: CanvasRenderingContext2D, pts: F0Point[], degree: number): void {
  if (pts.length < 2) { drawNone(ctx, pts); return; }
  if (pts.length <= degree) { drawNone(ctx, pts); return; }

  const steps = Math.max(pts.length * 3, 100);
  const curve = bsplineEval(pts, degree, steps);

  ctx.beginPath();
  ctx.moveTo(curve[0].x, curve[0].y);
  for (let i = 1; i < curve.length; i++) {
    ctx.lineTo(curve[i].x, curve[i].y);
  }
  ctx.stroke();
}

function drawCubicBspline(ctx: CanvasRenderingContext2D, pts: F0Point[]): void {
  drawBspline(ctx, pts, 3);
}

function drawQuarticBspline(ctx: CanvasRenderingContext2D, pts: F0Point[]): void {
  drawBspline(ctx, pts, 4);
}

/**
 * Render the F0 contour onto the canvas.
 */
export function renderF0(
  ctx: CanvasRenderingContext2D,
  f0: Float32Array,
  timestep: number,
  scrollX: number,
  pps: number,
  highestMidi: number,
  pixelsPerSemitone: number,
  smoothing: F0Smoothing = 'none',
): void {
  if (f0.length === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const width = ctx.canvas.width / dpr;

  ctx.save();
  ctx.strokeStyle = '#F0997B';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.85;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const visibleTimeStart = scrollX;
  const visibleTimeEnd = scrollX + width / pps;
  const startFrame = Math.max(0, Math.floor(visibleTimeStart / timestep) - 2);
  const endFrame = Math.min(f0.length - 1, Math.ceil(visibleTimeEnd / timestep) + 2);

  const segments = collectSegments(
    f0, timestep, startFrame, endFrame,
    scrollX, pps, highestMidi, pixelsPerSemitone,
  );

  const drawFn =
    smoothing === 'bezier' ? drawBezier :
    smoothing === 'catmull-rom' ? drawCatmullRom :
    smoothing === 'cubic' ? drawCubicBspline :
    smoothing === 'quartic' ? drawQuarticBspline :
    smoothing === 'linear' ? drawLinear :
    drawNone;

  for (const seg of segments) {
    if (seg.length === 0) continue;
    if (seg.length === 1) {
      ctx.beginPath();
      ctx.arc(seg[0].x, seg[0].y, 1, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    drawFn(ctx, seg);
  }

  ctx.restore();
}
