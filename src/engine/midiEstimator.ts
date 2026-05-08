import type { WordGroup } from '../types';

interface EstimatedNote {
  midiPitch: number;
  centsOffset: number;
  isRest: boolean;
}

export function estimateMidi(
  f0: Float32Array,
  timestep: number,
  wordGroups: WordGroup[],
  restUvRatio: number = 0.85,
): EstimatedNote[] {
  const results: EstimatedNote[] = [];

  for (const wg of wordGroups) {
    const startFrame = Math.round(wg.startTime / timestep);
    const endFrame = Math.min(Math.round((wg.startTime + wg.duration) / timestep), f0.length);

    if (startFrame >= endFrame) {
      results.push({ midiPitch: 60, centsOffset: 0, isRest: true });
      continue;
    }

    let voicedCount = 0;
    const totalCount = endFrame - startFrame;

    for (let i = startFrame; i < endFrame; i++) {
      if (f0[i] > 0) voicedCount++;
    }

    const uvRatio = 1.0 - voicedCount / totalCount;

    if (uvRatio > restUvRatio) {
      results.push({ midiPitch: 0, centsOffset: 0, isRest: true });
      continue;
    }

    const midiValues: number[] = [];
    for (let i = startFrame; i < endFrame; i++) {
      if (f0[i] > 0) {
        midiValues.push(12.0 * Math.log2(f0[i] / 440.0) + 69.0);
      }
    }

    if (midiValues.length === 0) {
      results.push({ midiPitch: 60, centsOffset: 0, isRest: true });
      continue;
    }

    const counts = new Int32Array(128);
    for (const m of midiValues) {
      const rounded = Math.round(m);
      if (rounded >= 0 && rounded < 128) {
        counts[rounded]++;
      }
    }

    let bestMidi = 60;
    let bestCount = 0;
    for (let i = 0; i < 128; i++) {
      if (counts[i] > bestCount) {
        bestCount = counts[i];
        bestMidi = i;
      }
    }

    let sum = 0;
    let cnt = 0;
    for (const m of midiValues) {
      if (Math.abs(m - bestMidi) <= 0.5) {
        sum += m;
        cnt++;
      }
    }

    const preciseMidi = cnt > 0 ? sum / cnt : bestMidi;
    const centsOffset = Math.round((preciseMidi - bestMidi) * 100);

    results.push({
      midiPitch: bestMidi,
      centsOffset: Math.max(-50, Math.min(49, centsOffset)),
      isRest: false,
    });
  }

  return results;
}
