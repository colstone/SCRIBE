import { create } from 'zustand';

export type StatusColor = 'idle' | 'working' | 'success' | 'error';

interface StatusState {
  text: string;
  color: StatusColor;
  setText: (text: string) => void;
  setStatus: (text: string, color: StatusColor) => void;
  setIdle: () => void;
}

export const useStatusStore = create<StatusState>((set) => ({
  text: '就绪',
  color: 'idle',

  setText: (text: string) => set({ text }),

  setStatus: (text: string, color: StatusColor) => set({ text, color }),

  setIdle: () => set({ text: '就绪', color: 'idle' }),
}));
