import type { WordGroup, Note } from '../types';

interface SomeFrameData {
  frameMidi: number[];
  frameBounds: number[];
  frameRest: boolean[];
  timestep: number;
}

interface EstimatedNote {
  midiPitch: number;
  centsOffset: number;
  isRest: boolean;
  startTime: number;
  duration: number;
}

export function estimateMidiWithSome(
  someData: SomeFrameData,
  wordGroups: WordGroup[],
  existingNotes: Note[],
): { notes: EstimatedNote[]; noteCountPerWg: number[] } {
  const { frameMidi, frameBounds, frameRest, timestep } = someData;
  const allNotes: EstimatedNote[] = [];
  const noteCountPerWg: number[] = [];

  for (const wg of wordGroups) {
    const wgStart = wg.startTime;
    const wgEnd = wg.startTime + wg.duration;
    const startFrame = Math.round(wgStart / timestep);
    const endFrame = Math.min(Math.round(wgEnd / timestep), frameMidi.length);

    if (startFrame >= endFrame) {
      allNotes.push({ midiPitch: 0, centsOffset: 0, isRest: true, startTime: wgStart, duration: wg.duration });
      noteCountPerWg.push(1);
      continue;
    }

    // Detect sub-note boundaries within this word group using SOME's boundary signal
    const subNotes = splitByBoundary(frameMidi, frameBounds, frameRest, startFrame, endFrame, timestep);

    if (subNotes.length === 0) {
      allNotes.push({ midiPitch: 0, centsOffset: 0, isRest: true, startTime: wgStart, duration: wg.duration });
      noteCountPerWg.push(1);
      continue;
    }

    // Clamp sub-notes to word group boundaries
    for (const sn of subNotes) {
      sn.startTime = Math.max(sn.startTime, wgStart);
      const snEnd = Math.min(sn.startTime + sn.duration, wgEnd);
      sn.duration = snEnd - sn.startTime;
    }

    // Filter out tiny notes (< 30ms)
    const filtered = subNotes.filter(n => n.duration >= 0.03);
    if (filtered.length === 0) {
      // Fallback: single note from all voiced frames
      const est = aggregateFrames(frameMidi, frameRest, startFrame, endFrame);
      allNotes.push({ ...est, startTime: wgStart, duration: wg.duration });
      noteCountPerWg.push(1);
    } else {
      for (const n of filtered) { allNotes.push(n); }
      noteCountPerWg.push(filtered.length);
    }
  }

  return { notes: allNotes, noteCountPerWg };
}

function splitByBoundary(
  frameMidi: number[], frameBounds: number[], frameRest: boolean[],
  startFrame: number, endFrame: number, timestep: number,
): EstimatedNote[] {
  const len = endFrame - startFrame;
  if (len <= 0) return [];

  // Use boundary cumsum to detect note transitions within this segment
  let cumsum = 0;
  let prevRound = 0;
  const segments: { from: number; to: number }[] = [];
  let segStart = startFrame;

  for (let i = startFrame; i < endFrame; i++) {
    cumsum += frameBounds[i];
    const rounded = Math.round(cumsum);
    if (i > startFrame && rounded > prevRound) {
      segments.push({ from: segStart, to: i });
      segStart = i;
    }
    prevRound = rounded;
  }
  segments.push({ from: segStart, to: endFrame });

  // Merge adjacent segments with similar pitch (< 1 semitone difference)
  const merged: { from: number; to: number }[] = [];
  for (const seg of segments) {
    const midi = medianVoicedMidi(frameMidi, frameRest, seg.from, seg.to);
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      const prevMidi = medianVoicedMidi(frameMidi, frameRest, prev.from, prev.to);
      if (midi !== null && prevMidi !== null && Math.abs(midi - prevMidi) < 0.8) {
        prev.to = seg.to;
        continue;
      }
    }
    merged.push({ from: seg.from, to: seg.to });
  }

  // Convert to EstimatedNote
  return merged.map(seg => {
    const est = aggregateFrames(frameMidi, frameRest, seg.from, seg.to);
    return {
      ...est,
      startTime: seg.from * timestep,
      duration: (seg.to - seg.from) * timestep,
    };
  });
}

function medianVoicedMidi(frameMidi: number[], frameRest: boolean[], from: number, to: number): number | null {
  const vals: number[] = [];
  for (let i = from; i < to; i++) {
    if (!frameRest[i] && frameMidi[i] > 0) vals.push(frameMidi[i]);
  }
  if (vals.length === 0) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

function aggregateFrames(
  frameMidi: number[], frameRest: boolean[], from: number, to: number,
): { midiPitch: number; centsOffset: number; isRest: boolean } {
  const voiced: number[] = [];
  for (let i = from; i < to; i++) {
    if (!frameRest[i] && frameMidi[i] > 0) voiced.push(frameMidi[i]);
  }

  const total = to - from;
  if (voiced.length === 0 || voiced.length < total * 0.15) {
    return { midiPitch: 0, centsOffset: 0, isRest: true };
  }

  // Histogram voting
  const counts = new Int32Array(128);
  for (const m of voiced) {
    const r = Math.round(m);
    if (r >= 0 && r < 128) counts[r]++;
  }
  let bestMidi = 60, bestCount = 0;
  for (let i = 0; i < 128; i++) {
    if (counts[i] > bestCount) { bestCount = counts[i]; bestMidi = i; }
  }

  // Average near center
  let sum = 0, cnt = 0;
  for (const m of voiced) {
    if (Math.abs(m - bestMidi) <= 0.5) { sum += m; cnt++; }
  }
  const precise = cnt > 0 ? sum / cnt : bestMidi;
  const centsOffset = Math.round((precise - bestMidi) * 100);

  return {
    midiPitch: bestMidi,
    centsOffset: Math.max(-50, Math.min(49, centsOffset)),
    isRest: false,
  };
}
