import { create } from 'zustand';

const STORAGE_KEY = 'scribe-settings';

export interface AppSettings {
  f0HopSize: number;
  f0Min: number;
  f0Max: number;
  f0SampleRate: number;
  f0Algorithm: 'parselmouth-rust' | 'rmvpe' | 'fcpe';
  voicingThreshold: number;
  silenceThreshold: number;
  octaveCost: number;
  octaveJumpCost: number;
  voicedUnvoicedCost: number;
  f0MedianFilter: boolean;
  f0MedianFilterSize: number;
  f0Smoothing: 'none' | 'linear' | 'bezier' | 'catmull-rom' | 'cubic' | 'quartic';
  uiScale: number;
  language: 'zh' | 'en';
  audioDeviceId: string;
  audioBufferSize: number;
  audioExclusive: boolean;
  midiEstimator: 'simple' | 'some';
  navigationMode: 'mouse' | 'trackpad' | 'touch';
}

const DEFAULTS: AppSettings = {
  f0HopSize: 441,
  f0Min: 40,
  f0Max: 2000,
  f0SampleRate: 44100,
  f0Algorithm: 'parselmouth-rust',
  voicingThreshold: 0.25,
  silenceThreshold: 0.01,
  octaveCost: 0.05,
  octaveJumpCost: 0.35,
  voicedUnvoicedCost: 0.14,
  f0MedianFilter: true,
  f0MedianFilterSize: 5,
  f0Smoothing: 'catmull-rom' as const,
  uiScale: 1.0,
  language: 'zh',
  audioDeviceId: '',
  audioBufferSize: 512,
  audioExclusive: false,
  midiEstimator: 'simple' as const,
  navigationMode: 'mouse' as const,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

function persist(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

interface SettingsState extends AppSettings {
  update: (partial: Partial<AppSettings>) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadSettings(),

  update: (partial: Partial<AppSettings>) => {
    const next = { ...get(), ...partial };
    persist(next);
    set(partial);
  },

  reset: () => {
    persist(DEFAULTS);
    set(DEFAULTS);
  },
}));
