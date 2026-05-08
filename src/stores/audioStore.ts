import { create } from 'zustand';
import { readFile } from '@tauri-apps/plugin-fs';
import { AudioEngine } from '../audio/audioEngine';
import { extractF0Simple } from '../audio/f0Extract';
import { useProjectStore } from './projectStore';
import { useStatusStore } from './statusStore';
import { useSettingsStore } from './settingsStore';

let invokeCache: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
async function getInvoke() {
  if (!invokeCache) {
    const { invoke } = await import('@tauri-apps/api/core');
    invokeCache = invoke;
  }
  return invokeCache;
}

function medianFilterF0(f0: Float32Array, size: number): Float32Array<ArrayBuffer> {
  if (size < 3) return new Float32Array(f0);
  const half = Math.floor(size / 2);
  const out = new Float32Array(f0.length);
  const buf: number[] = new Array(size);

  for (let i = 0; i < f0.length; i++) {
    let count = 0;
    for (let j = -half; j <= half; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < f0.length && f0[idx] > 0) {
        buf[count++] = f0[idx];
      }
    }
    if (count === 0) {
      out[i] = 0;
    } else {
      const slice = buf.slice(0, count).sort((a, b) => a - b);
      out[i] = slice[Math.floor(count / 2)];
    }
  }
  return out;
}

const audioEngine = new AudioEngine();

let rafId: number | null = null;

interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  audioDuration: number;
  isLoaded: boolean;
  waveformData: Float32Array | null;
  sampleRate: number;

  loadAudio: (wavPath: string) => Promise<void>;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekTo: (time: number) => void;
  setCurrentTime: (time: number) => void;
  setAudioDuration: (duration: number) => void;
  setIsLoaded: (loaded: boolean) => void;
  setWaveformData: (data: Float32Array | null, sampleRate: number) => void;
  cleanup: () => void;
}

let playStartTime = 0;

function startTimeUpdates() {
  playStartTime = Date.now();
  const tick = async () => {
    try {
      const inv = await getInvoke();
      const result = await inv('audio_get_position') as { time: number; isPlaying: boolean };
      if (!result.isPlaying) {
        if (Date.now() - playStartTime < 500) {
          rafId = requestAnimationFrame(tick);
          return;
        }
        stopTimeUpdates();
        useAudioStore.setState({ isPlaying: false, currentTime: result.time });
        return;
      }
      useAudioStore.setState({ currentTime: result.time });
    } catch {}
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function stopTimeUpdates() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export const useAudioStore = create<AudioState>((set, get) => ({
  isPlaying: false,
  currentTime: 0,
  audioDuration: 0,
  isLoaded: false,
  waveformData: null,
  sampleRate: 44100,

  loadAudio: async (wavPath: string) => {
    const { pause } = get();
    pause();

    set({ isLoaded: false, currentTime: 0, audioDuration: 0, waveformData: null });

    if (!wavPath) return;

    try {
      const inv = await getInvoke();
      // Load into Rust audio engine
      const loadResult = await inv('audio_load', { wavPath }) as { duration: number; sampleRate: number };

      // Also decode in Web Audio for waveform visualization
      await audioEngine.resume();
      const uint8 = await readFile(wavPath);
      const arrayBuf = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
      const audioBuffer = await audioEngine.audioContext.decodeAudioData(arrayBuf);
      const waveform = audioBuffer.getChannelData(0);

      set({
        audioDuration: audioBuffer.duration,
        isLoaded: true,
        currentTime: 0,
        waveformData: waveform,
        sampleRate: audioBuffer.sampleRate,
      });

      // Extract F0 only if this segment doesn't already have it
      const projStore = useProjectStore.getState();
      const idx = projStore.currentSegmentIndex;
      const existingF0 = projStore.getCurrentSegment()?.data?.f0;

      if (existingF0 && existingF0.length > 0) {
        // Already have F0, skip extraction
      } else {
        // Listen for progress events from Rust
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen<number>('f0-progress', (event) => {
          const pct = Math.round(event.payload);
          useStatusStore.getState().setStatus(`F0 提取中... ${pct}%`, 'working');
        });

        try {
          const settings = useSettingsStore.getState();
          useStatusStore.getState().setStatus('F0 提取中... 0%', 'working');

          let result: { f0: number[]; timestep: number };

          if (settings.f0Algorithm === 'rmvpe') {
            result = await inv('extract_f0_rmvpe', {
              wavPath,
            }) as { f0: number[]; timestep: number };
          } else if (settings.f0Algorithm === 'fcpe') {
            result = await inv('extract_f0_fcpe', {
              wavPath,
            }) as { f0: number[]; timestep: number };
          } else {
            result = await inv('extract_f0', {
              wavPath,
              hopSize: settings.f0HopSize,
              f0Min: settings.f0Min,
              f0Max: settings.f0Max,
              voicingThreshold: settings.voicingThreshold,
              silenceThreshold: settings.silenceThreshold,
              octaveCost: settings.octaveCost,
              octaveJumpCost: settings.octaveJumpCost,
              voicedUnvoicedCost: settings.voicedUnvoicedCost,
            }) as { f0: number[]; timestep: number };
          }
          unlisten();
          if (result.f0.length > 0) {
            let f0Data = new Float32Array(result.f0);
            if (settings.f0MedianFilter) {
              f0Data = medianFilterF0(f0Data, settings.f0MedianFilterSize);
            }
            projStore.updateSegmentData(idx, {
              f0: f0Data,
              f0Timestep: result.timestep,
            });
          }
          useStatusStore.getState().setStatus('F0 提取完成', 'success');
          setTimeout(() => useStatusStore.getState().setIdle(), 2000);
        } catch (rustErr) {
          unlisten();
          console.warn('Rust F0 failed, falling back to JS:', rustErr);
          useStatusStore.getState().setStatus('F0 回退到 JS...', 'working');
          try {
            let f0 = extractF0Simple(waveform, audioBuffer.sampleRate);
            if (f0.length > 0) {
              const settings2 = useSettingsStore.getState();
              if (settings2.f0MedianFilter) {
                f0 = medianFilterF0(f0 instanceof Float32Array ? f0 : new Float32Array(f0), settings2.f0MedianFilterSize);
              }
              projStore.updateSegmentData(idx, {
                f0,
                f0Timestep: 512 / audioBuffer.sampleRate,
              });
            }
          } catch (jsErr) {
            useStatusStore.getState().setStatus('F0 提取失败', 'error');
            setTimeout(() => useStatusStore.getState().setIdle(), 3000);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load audio:', err);
      set({ isLoaded: false });
    }
  },

  play: () => {
    const { audioDuration, currentTime } = get();
    if (audioDuration <= 0) return;
    getInvoke().then((inv) =>
      inv('audio_play', { fromTime: currentTime }).then(() => {
        set({ isPlaying: true });
        startTimeUpdates();
      })
    ).catch((e) => console.error('audio_play failed:', e));
  },

  pause: () => {
    stopTimeUpdates();
    getInvoke().then((inv) =>
      (inv('audio_pause') as Promise<{ currentTime: number }>).then((result) => {
        set({ isPlaying: false, currentTime: result.currentTime });
      })
    ).catch(() => {
      set({ isPlaying: false });
    });
  },

  togglePlay: () => {
    const { isPlaying, play, pause } = get();
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  },

  seekTo: (time: number) => {
    const { audioDuration, isPlaying } = get();
    const clamped = Math.max(0, Math.min(time, audioDuration));
    set({ currentTime: clamped });

    if (isPlaying) {
      stopTimeUpdates();
      getInvoke().then((inv) =>
        inv('audio_stop').then(() =>
          inv('audio_play', { fromTime: clamped }).then(() => {
            startTimeUpdates();
          })
        )
      ).catch(() => {});
    } else {
      getInvoke().then((inv) => inv('audio_seek', { time: clamped })).catch(() => {});
    }
  },

  setCurrentTime: (time: number) => set({ currentTime: time }),
  setAudioDuration: (duration: number) => set({ audioDuration: duration }),
  setIsLoaded: (loaded: boolean) => set({ isLoaded: loaded }),
  setWaveformData: (data: Float32Array | null, sampleRate: number) => set({ waveformData: data, sampleRate }),

  cleanup: () => {
    stopTimeUpdates();
    getInvoke().then((inv) => inv('audio_stop')).catch(() => {});
    set({ isPlaying: false, currentTime: 0 });
  },
}));
