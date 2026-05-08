import { create } from 'zustand';
import { save as showSaveDialog } from '@tauri-apps/plugin-dialog';
import { saveProject as saveProjectFile } from '../utils/projectFile';
import { useStatusStore } from './statusStore';
import type { Project, Segment, SegmentData, SegmentStatus, Note, WordGroup } from '../types';

// ============================================================================
// Project Store
// ============================================================================

const MAX_UNDO_SNAPSHOTS = 50;

interface UndoSnapshot {
  notes: Note[];
  wordGroups: WordGroup[];
}

interface ProjectState {
  // --- State ---
  project: Project | null;
  projectFilePath: string | null;
  currentSegmentIndex: number;
  isDirty: boolean;

  // Snapshot-based undo/redo stacks, keyed by segment index
  undoSnapshots: Record<number, UndoSnapshot[]>;
  redoSnapshots: Record<number, UndoSnapshot[]>;

  // --- Actions ---
  loadProject: (project: Project) => void;
  setProjectFilePath: (path: string) => void;
  closeProject: () => void;
  saveProject: () => Promise<void>;
  setCurrentSegment: (index: number) => void;
  updateSegmentStatus: (index: number, status: SegmentStatus) => void;
  updateSegmentData: (index: number, data: Partial<SegmentData>) => void;
  getCurrentSegment: () => Segment | null;

  // Undo/redo actions
  pushUndoSnapshot: (segmentIndex?: number) => void;
  undo: (segmentIndex?: number) => void;
  redo: (segmentIndex?: number) => void;
  canUndo: (segmentIndex?: number) => boolean;
  canRedo: (segmentIndex?: number) => boolean;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  // --- State ---
  project: null,
  projectFilePath: null,
  currentSegmentIndex: 0,
  isDirty: false,
  undoSnapshots: {},
  redoSnapshots: {},

  // --- Actions ---

  loadProject: (project: Project) => {
    set({
      project,
      currentSegmentIndex: 0,
      isDirty: false,
    });
  },

  closeProject: () => {
    set({
      project: null,
      projectFilePath: null,
      currentSegmentIndex: 0,
      isDirty: false,
      undoSnapshots: {},
      redoSnapshots: {},
    });
  },

  saveProject: async () => {
    const { project, projectFilePath } = get();
    if (!project) return;

    const updatedProject = {
      ...project,
      updatedAt: new Date().toISOString(),
    };

    let filePath = projectFilePath;
    if (!filePath) {
      const selected = await showSaveDialog({
        title: '保存项目',
        filters: [{ name: 'SCRIBE Project', extensions: ['scribe.json'] }],
      });
      if (!selected) return;
      filePath = selected;
      if (!filePath.endsWith('.scribe.json')) {
        filePath = filePath.replace(/\.json$/, '') + '.scribe.json';
      }
      set({ projectFilePath: filePath });
    }

    try {
      await saveProjectFile(updatedProject, filePath);
      set({ project: updatedProject, isDirty: false });
      useStatusStore.getState().setStatus('保存成功', 'success');
      setTimeout(() => useStatusStore.getState().setIdle(), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      useStatusStore.getState().setStatus(`保存失败: ${err}`, 'error');
      setTimeout(() => useStatusStore.getState().setIdle(), 5000);
    }
  },

  setProjectFilePath: (path: string) => {
    set({ projectFilePath: path });
  },

  setCurrentSegment: (index: number) => {
    const { project } = get();
    if (!project) return;
    if (index < 0 || index >= project.segments.length) return;

    set({ currentSegmentIndex: index });
  },

  updateSegmentStatus: (index: number, status: SegmentStatus) => {
    const { project } = get();
    if (!project) return;
    if (index < 0 || index >= project.segments.length) return;

    const segments = [...project.segments];
    segments[index] = { ...segments[index], status };

    set({
      project: { ...project, segments },
      isDirty: true,
    });
  },

  updateSegmentData: (index: number, data: Partial<SegmentData>) => {
    const { project } = get();
    if (!project) return;
    if (index < 0 || index >= project.segments.length) return;

    const segments = [...project.segments];
    const segment = segments[index];
    segments[index] = {
      ...segment,
      data: { ...segment.data, ...data },
    };

    set({
      project: { ...project, segments },
      isDirty: true,
    });
  },

  getCurrentSegment: () => {
    const { project, currentSegmentIndex } = get();
    if (!project) return null;
    if (currentSegmentIndex < 0 || currentSegmentIndex >= project.segments.length) return null;
    return project.segments[currentSegmentIndex];
  },

  pushUndoSnapshot: (segmentIndex?: number) => {
    const { project, currentSegmentIndex, undoSnapshots } = get();
    const idx = segmentIndex ?? currentSegmentIndex;
    if (!project) return;
    if (idx < 0 || idx >= project.segments.length) return;

    const { notes, wordGroups } = project.segments[idx].data;
    const snapshot: UndoSnapshot = JSON.parse(JSON.stringify({ notes, wordGroups }));

    const stack = [...(undoSnapshots[idx] ?? []), snapshot];
    if (stack.length > MAX_UNDO_SNAPSHOTS) {
      stack.splice(0, stack.length - MAX_UNDO_SNAPSHOTS);
    }

    set({
      undoSnapshots: { ...undoSnapshots, [idx]: stack },
      redoSnapshots: { ...get().redoSnapshots, [idx]: [] },
    });
  },

  undo: (segmentIndex?: number) => {
    const { project, currentSegmentIndex, undoSnapshots, redoSnapshots } = get();
    const idx = segmentIndex ?? currentSegmentIndex;
    if (!project) return;
    if (idx < 0 || idx >= project.segments.length) return;

    const undoStack = undoSnapshots[idx] ?? [];
    if (undoStack.length === 0) return;

    const { notes, wordGroups } = project.segments[idx].data;
    const currentSnapshot: UndoSnapshot = JSON.parse(JSON.stringify({ notes, wordGroups }));
    const redoStack = [...(redoSnapshots[idx] ?? []), currentSnapshot];

    const newUndoStack = [...undoStack];
    const snapshot = newUndoStack.pop()!;

    const segments = [...project.segments];
    const segment = segments[idx];
    segments[idx] = {
      ...segment,
      data: { ...segment.data, notes: snapshot.notes, wordGroups: snapshot.wordGroups },
    };

    set({
      project: { ...project, segments },
      undoSnapshots: { ...undoSnapshots, [idx]: newUndoStack },
      redoSnapshots: { ...redoSnapshots, [idx]: redoStack },
      isDirty: true,
    });
  },

  redo: (segmentIndex?: number) => {
    const { project, currentSegmentIndex, undoSnapshots, redoSnapshots } = get();
    const idx = segmentIndex ?? currentSegmentIndex;
    if (!project) return;
    if (idx < 0 || idx >= project.segments.length) return;

    const redoStack = redoSnapshots[idx] ?? [];
    if (redoStack.length === 0) return;

    const { notes, wordGroups } = project.segments[idx].data;
    const currentSnapshot: UndoSnapshot = JSON.parse(JSON.stringify({ notes, wordGroups }));
    const undoStack = [...(undoSnapshots[idx] ?? []), currentSnapshot];

    const newRedoStack = [...redoStack];
    const snapshot = newRedoStack.pop()!;

    const segments = [...project.segments];
    const segment = segments[idx];
    segments[idx] = {
      ...segment,
      data: { ...segment.data, notes: snapshot.notes, wordGroups: snapshot.wordGroups },
    };

    set({
      project: { ...project, segments },
      undoSnapshots: { ...undoSnapshots, [idx]: undoStack },
      redoSnapshots: { ...redoSnapshots, [idx]: newRedoStack },
      isDirty: true,
    });
  },

  canUndo: (segmentIndex?: number) => {
    const { currentSegmentIndex, undoSnapshots } = get();
    const idx = segmentIndex ?? currentSegmentIndex;
    return (undoSnapshots[idx] ?? []).length > 0;
  },

  canRedo: (segmentIndex?: number) => {
    const { currentSegmentIndex, redoSnapshots } = get();
    const idx = segmentIndex ?? currentSegmentIndex;
    return (redoSnapshots[idx] ?? []).length > 0;
  },
}));
