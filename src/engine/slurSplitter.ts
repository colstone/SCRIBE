function hzToMidi(hz: number): number {
  return 12.0 * Math.log2(hz / 440.0) + 69.0;
}

function modePitch(midiValues: number[]): number {
  if (midiValues.length === 0) return -1;
  const hist = new Map<number, number>();
  for (const v of midiValues) {
    const p = Math.round(v);
    hist.set(p, (hist.get(p) ?? 0) + 1);
  }
  let best = -1;
  let bestCount = 0;
  for (const [p, c] of hist) {
    if (c > bestCount) { best = p; bestCount = c; }
  }
  return best;
}

export function detectSlurSplits(
  f0: Float32Array,
  timestep: number,
  noteStart: number,
  noteDuration: number,
  minSegmentDuration: number = 0.12,
  minPitchDiff: number = 3,
): number[] {
  const startFrame = Math.round(noteStart / timestep);
  const endFrame = Math.min(Math.round((noteStart + noteDuration) / timestep), f0.length);
  const totalFrames = endFrame - startFrame;

  if (totalFrames < 10) return [];

  // Collect voiced MIDI values with their frame indices
  const voiced: { frame: number; midi: number }[] = [];
  for (let i = startFrame; i < endFrame; i++) {
    if (f0[i] > 0) {
      voiced.push({ frame: i, midi: hzToMidi(f0[i]) });
    }
  }

  // Need enough voiced frames to make a judgment
  if (voiced.length < 6) return [];

  // Try splitting at each candidate point (scan in 10% steps)
  // For each candidate, compute mode pitch of left and right halves
  // Pick the split point with the largest pitch difference
  const minFrameCount = Math.round(minSegmentDuration / timestep);
  let bestSplitFrame = -1;
  let bestDiff = 0;

  const step = Math.max(1, Math.floor(totalFrames / 20));
  for (let splitRel = minFrameCount; splitRel < totalFrames - minFrameCount; splitRel += step) {
    const splitAbsFrame = startFrame + splitRel;

    const leftMidi: number[] = [];
    const rightMidi: number[] = [];
    for (const v of voiced) {
      if (v.frame < splitAbsFrame) leftMidi.push(v.midi);
      else rightMidi.push(v.midi);
    }

    if (leftMidi.length < 3 || rightMidi.length < 3) continue;

    const leftMode = modePitch(leftMidi);
    const rightMode = modePitch(rightMidi);
    if (leftMode < 0 || rightMode < 0) continue;

    const diff = Math.abs(leftMode - rightMode);
    if (diff >= minPitchDiff && diff > bestDiff) {
      bestDiff = diff;
      bestSplitFrame = splitAbsFrame;
    }
  }

  if (bestSplitFrame < 0) return [];

  // Refine: scan frame-by-frame around the best candidate
  const refineStart = Math.max(startFrame + minFrameCount, bestSplitFrame - step);
  const refineEnd = Math.min(endFrame - minFrameCount, bestSplitFrame + step);
  for (let sf = refineStart; sf <= refineEnd; sf++) {
    const leftMidi: number[] = [];
    const rightMidi: number[] = [];
    for (const v of voiced) {
      if (v.frame < sf) leftMidi.push(v.midi);
      else rightMidi.push(v.midi);
    }
    if (leftMidi.length < 3 || rightMidi.length < 3) continue;
    const diff = Math.abs(modePitch(leftMidi) - modePitch(rightMidi));
    if (diff > bestDiff) {
      bestDiff = diff;
      bestSplitFrame = sf;
    }
  }

  const splitTime = bestSplitFrame * timestep;
  if (splitTime <= noteStart + minSegmentDuration || splitTime >= noteStart + noteDuration - minSegmentDuration) {
    return [];
  }

  return [splitTime];
}
