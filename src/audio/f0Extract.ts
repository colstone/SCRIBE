const HOP_SIZE = 512;
const FRAME_SIZE = 2048;
const F0_MIN = 40;
const F0_MAX = 1100;

export function extractF0Simple(
  samples: Float32Array,
  sampleRate: number,
): Float32Array {
  const hopSize = HOP_SIZE;
  const frameSize = FRAME_SIZE;
  const frameCount = Math.floor((samples.length - frameSize) / hopSize) + 1;
  if (frameCount <= 0) return new Float32Array(0);

  const f0 = new Float32Array(frameCount);
  const minLag = Math.floor(sampleRate / F0_MAX);
  const maxLag = Math.floor(sampleRate / F0_MIN);

  for (let fi = 0; fi < frameCount; fi++) {
    const offset = fi * hopSize;
    let bestLag = 0;
    let bestCorr = 0;
    let energy = 0;

    for (let j = 0; j < frameSize; j++) {
      energy += samples[offset + j] * samples[offset + j];
    }

    if (energy < 1e-6) {
      f0[fi] = 0;
      continue;
    }

    for (let lag = minLag; lag <= maxLag && offset + lag + frameSize <= samples.length; lag++) {
      let corr = 0;
      let energy2 = 0;
      for (let j = 0; j < frameSize; j++) {
        corr += samples[offset + j] * samples[offset + j + lag];
        energy2 += samples[offset + j + lag] * samples[offset + j + lag];
      }
      const norm = Math.sqrt(energy * energy2);
      if (norm > 0) corr /= norm;

      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    if (bestCorr > 0.3 && bestLag > 0) {
      f0[fi] = sampleRate / bestLag;
    } else {
      f0[fi] = 0;
    }
  }

  return f0;
}
