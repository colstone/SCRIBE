// ============================================================================
// SCRIBE - Backend Abstract Interface
// ============================================================================

/**
 * Abstract interface for the Python backend (sidecar).
 * All heavy computation (F0 extraction, MIDI estimation, slur detection, etc.)
 * is delegated to the backend process via this interface.
 */
export interface BackendInterface {
  /**
   * Extract fundamental frequency (F0) from a WAV file.
   */
  extractF0(params: {
    wavPath: string;
    algorithm: 'parselmouth' | 'rmvpe';
    hopSize: number;
    sampleRate: number;
    f0Min: number;
    f0Max: number;
  }): Promise<{ f0: number[]; timestep: number; uv: boolean[] }>;

  /**
   * Estimate MIDI note pitches from F0 contour and word group boundaries.
   */
  estimateMidi(params: {
    f0: number[];
    timestep: number;
    wordGroups: { startTime: number; duration: number }[];
    restUvRatio?: number;
  }): Promise<{ notes: { midiPitch: number; centsOffset: number; isRest: boolean }[] }>;

  /**
   * Detect slur split points within word groups based on F0 contour analysis.
   */
  detectSlur(params: {
    f0: number[];
    timestep: number;
    wordGroups: { startTime: number; duration: number }[];
    thresholdSemitones?: number;
    minSegmentFrames?: number;
  }): Promise<{ splitPoints: { wordIndex: number; time: number }[] }>;

  /**
   * Load audio samples from a WAV file, optionally resampling.
   */
  loadAudio(params: {
    wavPath: string;
    targetSampleRate?: number;
  }): Promise<{ samples: number[]; sampleRate: number; duration: number }>;

  /**
   * Snap a time range of F0 values to the nearest MIDI pitch with cents offset.
   */
  snapCents(params: {
    f0: number[];
    timestep: number;
    startTime: number;
    endTime: number;
  }): Promise<{ midiPitch: number; centsOffset: number }>;

  /**
   * Infer ph_num (phonemes-per-word grouping) from phoneme sequence and vowel list.
   */
  inferPhNum(params: {
    phSeq: string[];
    vowelList: string[];
  }): Promise<{ phNum: number[] }>;

  /**
   * Health check: verify the backend is running and responsive.
   */
  ping(): Promise<{ pong: boolean }>;
}
