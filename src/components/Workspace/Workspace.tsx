import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import WorkspaceHeader from './WorkspaceHeader';
import Toolbar from './Toolbar';
import Playbar from './Playbar';
import TrackContainer from '../Tracks/TrackContainer';
import { useEditorStore } from '../../stores/editorStore';
import { useProjectStore } from '../../stores/projectStore';
import { useAudioStore } from '../../stores/audioStore';
import { useStatusStore } from '../../stores/statusStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { midiToNoteName } from '../../utils/midiUtils';
import { estimateMidi } from '../../engine/midiEstimator';
import { estimateMidiWithSome } from '../../engine/someEstimator';
import { detectSlurSplits } from '../../engine/slurSplitter';

// ============================================================================
// Workspace - Main workspace layout
// ============================================================================

interface WorkspaceProps {
  hasProject: boolean;
  onShowImport?: () => void;
  onOpenProject?: () => void;
}

const SANS_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    height: '100%',
    fontFamily: SANS_FONT,
    backgroundColor: '#1A1918',
    overflow: 'hidden',
  } as React.CSSProperties,

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1918',
    fontFamily: SANS_FONT,
    gap: '24px',
  } as React.CSSProperties,

  emptyTitle: {
    fontSize: '18px',
    fontWeight: 500,
    color: '#A09D96',
    userSelect: 'none',
    letterSpacing: '0.02em',
  } as React.CSSProperties,

  emptySubtitle: {
    fontSize: '12px',
    fontWeight: 400,
    color: '#5F5D58',
    userSelect: 'none',
    marginTop: '-16px',
  } as React.CSSProperties,

  emptyButtons: {
    display: 'flex',
    gap: '10px',
    marginTop: '4px',
  } as React.CSSProperties,

  emptyText: {
    fontSize: '13px',
    fontWeight: 400,
    color: '#5F5D58',
    userSelect: 'none',
  } as React.CSSProperties,

  emptyButton: {
    padding: '8px 20px',
    borderRadius: '6px',
    backgroundColor: '#2A2926',
    border: '0.5px solid #33312E',
    color: '#A09D96',
    fontSize: '12px',
    fontWeight: 400,
    fontFamily: SANS_FONT,
    cursor: 'pointer',
    transition: 'background-color 0.1s, color 0.1s',
  } as React.CSSProperties,
};

const Workspace: React.FC<WorkspaceProps> = ({ hasProject, onShowImport, onOpenProject }) => {
  const [importHovered, setImportHovered] = useState(false);
  const [openHovered, setOpenHovered] = useState(false);

  // Store subscriptions
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);

  const segment = useProjectStore((s) => s.getCurrentSegment());
  const saveProject = useProjectStore((s) => s.saveProject);
  const updateSegmentStatus = useProjectStore((s) => s.updateSegmentStatus);
  const currentSegmentIndex = useProjectStore((s) => s.currentSegmentIndex);
  const undoAction = useProjectStore((s) => s.undo);
  const redoAction = useProjectStore((s) => s.redo);
  const storeCanUndo = useProjectStore((s) => s.canUndo());
  const storeCanRedo = useProjectStore((s) => s.canRedo());

  const selectedNoteIds = useEditorStore((s) => s.selectedNoteIds);
  const hoveredNoteId = useEditorStore((s) => s.hoveredNoteId);
  const updateSegmentData = useProjectStore((s) => s.updateSegmentData);

  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentTime = useAudioStore((s) => s.currentTime);
  const audioDuration = useAudioStore((s) => s.audioDuration);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const seekTo = useAudioStore((s) => s.seekTo);

  // Callbacks
  const handleModeChange = useCallback(
    (newMode: string) => {
      setMode(newMode as 'select' | 'split' | 'merge');
    },
    [setMode]
  );

  const handleUndo = useCallback(() => {
    undoAction();
  }, [undoAction]);

  const handleRedo = useCallback(() => {
    redoAction();
  }, [redoAction]);

  const handleMarkDone = useCallback(() => {
    updateSegmentStatus(currentSegmentIndex, 'done');
  }, [updateSegmentStatus, currentSegmentIndex]);

  const handleSave = useCallback(() => {
    saveProject();
  }, [saveProject]);

  const handlePitchUp = useCallback(() => {
    if (!segment?.data?.notes || selectedNoteIds.size === 0) return;
    useProjectStore.getState().pushUndoSnapshot(currentSegmentIndex);
    const notes = segment.data.notes.map((note) =>
      selectedNoteIds.has(note.id) ? { ...note, midiPitch: note.midiPitch + 1 } : note
    );
    updateSegmentData(currentSegmentIndex, { notes });
  }, [segment, selectedNoteIds, updateSegmentData, currentSegmentIndex]);

  const handlePitchDown = useCallback(() => {
    if (!segment?.data?.notes || selectedNoteIds.size === 0) return;
    useProjectStore.getState().pushUndoSnapshot(currentSegmentIndex);
    const notes = segment.data.notes.map((note) =>
      selectedNoteIds.has(note.id) ? { ...note, midiPitch: note.midiPitch - 1 } : note
    );
    updateSegmentData(currentSegmentIndex, { notes });
  }, [segment, selectedNoteIds, updateSegmentData, currentSegmentIndex]);

  const handleAutoEstimate = useCallback(async () => {
    if (!segment?.data) return;
    const { f0, f0Timestep, notes, wordGroups } = segment.data;

    const settings = useSettingsStore.getState();

    if (settings.midiEstimator === 'some') {
      // SOME mode: invoke backend, then split within word groups
      if (!segment.wavPath) {
        useStatusStore.getState().setStatus('无音频文件', 'error');
        setTimeout(() => useStatusStore.getState().setIdle(), 2000);
        return;
      }
      useStatusStore.getState().setStatus('SOME 推理中...', 'working');
      const projStore = useProjectStore.getState();
      projStore.pushUndoSnapshot(currentSegmentIndex);

      try {
        const someResult = await invoke('extract_midi_some', { wavPath: segment.wavPath }) as {
          frameMidi: number[]; frameBounds: number[]; frameRest: boolean[]; timestep: number;
        };

        const { notes: estNotes, noteCountPerWg } = estimateMidiWithSome(someResult, wordGroups, notes);

        // Rebuild notes array and update wordGroup noteStartIndex/noteCount
        const newNotes: typeof notes = [];
        const newWgs = wordGroups.map((wg, wgIdx) => {
          const nc = noteCountPerWg[wgIdx];
          const nsi = newNotes.length;
          for (let j = 0; j < nc; j++) {
            const est = estNotes[nsi + j - (nsi - newNotes.length) + j];
            // Calculate correct index into estNotes
            let estIdx = 0;
            for (let k = 0; k < wgIdx; k++) estIdx += noteCountPerWg[k];
            const e = estNotes[estIdx + j];
            newNotes.push({
              id: `${segment.name}_n${newNotes.length}`,
              startTime: e.startTime,
              duration: e.duration,
              midiPitch: e.midiPitch,
              centsOffset: e.centsOffset,
              isRest: e.isRest,
            });
          }
          return { ...wg, noteStartIndex: nsi, noteCount: nc };
        });

        projStore.updateSegmentData(currentSegmentIndex, { notes: newNotes, wordGroups: newWgs });
        useStatusStore.getState().setStatus('SOME 估算完成', 'success');
      } catch (err) {
        useStatusStore.getState().setStatus(`SOME 失败: ${err}`, 'error');
      }
      setTimeout(() => useStatusStore.getState().setIdle(), 2000);
      return;
    }

    // Simple mode: use F0-based estimation per note
    if (!f0 || f0.length === 0) {
      useStatusStore.getState().setStatus('无 F0 数据，请先加载音频', 'error');
      setTimeout(() => useStatusStore.getState().setIdle(), 2000);
      return;
    }

    useStatusStore.getState().setStatus('自动估算中...', 'working');
    const projStore = useProjectStore.getState();
    projStore.pushUndoSnapshot(currentSegmentIndex);

    const noteAsWg = notes.map((n) => ({
      startPhIndex: 0,
      phCount: 0,
      startTime: n.startTime,
      duration: n.duration,
      noteStartIndex: 0,
      noteCount: 1,
    }));

    const estimated = estimateMidi(f0, f0Timestep, noteAsWg);

    const updatedNotes = notes.map((note, i) => {
      if (i >= estimated.length) return note;
      const est = estimated[i];
      if (est.isRest) {
        return { ...note, isRest: true };
      }
      return {
        ...note,
        midiPitch: est.midiPitch,
        centsOffset: est.centsOffset,
        isRest: false,
      };
    });

    projStore.updateSegmentData(currentSegmentIndex, { notes: updatedNotes });
    useStatusStore.getState().setStatus('自动估算完成', 'success');
    setTimeout(() => useStatusStore.getState().setIdle(), 2000);
  }, [segment, currentSegmentIndex]);

  const handleMerge = useCallback(() => {
    if (!segment?.data || selectedNoteIds.size < 2) {
      useStatusStore.getState().setStatus('请选择 2 个以上同词组音符', 'error');
      setTimeout(() => useStatusStore.getState().setIdle(), 2000);
      return;
    }

    const { notes, wordGroups } = segment.data;
    const selIndices = notes
      .map((n, i) => (selectedNoteIds.has(n.id) ? i : -1))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);

    const findWgByIndex = (noteIdx: number) => {
      const wg = wordGroups.find(
        (wg) => wg.noteCount > 0 && noteIdx >= wg.noteStartIndex && noteIdx < wg.noteStartIndex + wg.noteCount,
      );
      if (wg) return wg;
      const note = notes[noteIdx];
      if (!note) return undefined;
      return wordGroups.find(
        (wg) => note.startTime >= wg.startTime - 0.001 && note.startTime < wg.startTime + wg.duration + 0.001,
      );
    };

    const firstWg = findWgByIndex(selIndices[0]);
    if (!firstWg) {
      useStatusStore.getState().setStatus('找不到所属词组', 'error');
      setTimeout(() => useStatusStore.getState().setIdle(), 2000);
      return;
    }
    for (const idx of selIndices) {
      const wg = findWgByIndex(idx);
      if (!wg || wg !== firstWg) {
        useStatusStore.getState().setStatus('选中的音符不在同一词组内', 'error');
        setTimeout(() => useStatusStore.getState().setIdle(), 2000);
        return;
      }
    }

    for (let i = 1; i < selIndices.length; i++) {
      if (selIndices[i] !== selIndices[i - 1] + 1) {
        useStatusStore.getState().setStatus('选中的音符必须相邻', 'error');
        setTimeout(() => useStatusStore.getState().setIdle(), 2000);
        return;
      }
    }

    const projStore = useProjectStore.getState();
    projStore.pushUndoSnapshot(currentSegmentIndex);

    const firstNote = notes[selIndices[0]];
    const lastNote = notes[selIndices[selIndices.length - 1]];
    const mergedNote = {
      ...firstNote,
      duration: lastNote.startTime + lastNote.duration - firstNote.startTime,
    };

    const removedIds = new Set(selIndices.slice(1).map((i) => notes[i].id));
    const newNotes = notes
      .map((n) => (n.id === firstNote.id ? mergedNote : n))
      .filter((n) => !removedIds.has(n.id));

    const removedCount = selIndices.length - 1;
    const wgIdx = wordGroups.indexOf(firstWg);
    const newWgs = wordGroups.map((wg, wi) => {
      if (wi === wgIdx) return { ...wg, noteCount: wg.noteCount - removedCount };
      if (wi > wgIdx) return { ...wg, noteStartIndex: wg.noteStartIndex - removedCount };
      return wg;
    });

    projStore.updateSegmentData(currentSegmentIndex, { notes: newNotes, wordGroups: newWgs });
    useEditorStore.getState().deselectAll();
    useEditorStore.getState().addToSelection([mergedNote.id]);
  }, [segment, selectedNoteIds, currentSegmentIndex]);

  const handleAutoSlur = useCallback(() => {
    if (!segment?.data) return;
    const { f0, f0Timestep, notes, wordGroups } = segment.data;
    if (!f0 || f0.length === 0) {
      useStatusStore.getState().setStatus('请先提取 F0', 'error');
      setTimeout(() => useStatusStore.getState().setIdle(), 2000);
      return;
    }

    const projStore = useProjectStore.getState();
    projStore.pushUndoSnapshot(currentSegmentIndex);

    // Build new notes array + index mapping (old note index → new range)
    const newNotes: typeof notes = [];
    const isSplitNote = new Set<number>();
    const oldToNew: { start: number; count: number }[] = [];

    for (let ni = 0; ni < notes.length; ni++) {
      const note = notes[ni];

      if (note.isRest) {
        oldToNew.push({ start: newNotes.length, count: 1 });
        newNotes.push(note);
        continue;
      }

      const splits = detectSlurSplits(f0, f0Timestep, note.startTime, note.duration);

      if (splits.length === 0) {
        oldToNew.push({ start: newNotes.length, count: 1 });
        newNotes.push(note);
        continue;
      }

      const startNew = newNotes.length;
      const times = [note.startTime, ...splits, note.startTime + note.duration];
      let childCount = 0;
      for (let si = 0; si < times.length - 1; si++) {
        const start = times[si];
        const dur = times[si + 1] - start;
        if (dur < f0Timestep) continue;
        isSplitNote.add(newNotes.length);
        childCount++;
        newNotes.push({
          id: crypto.randomUUID ? crypto.randomUUID() : `${note.id}_s${si}`,
          startTime: start,
          duration: dur,
          midiPitch: note.midiPitch,
          centsOffset: note.centsOffset,
          isRest: false,
        });
      }
      oldToNew.push({ start: startNew, count: childCount });
    }

    if (isSplitNote.size === 0) {
      useStatusStore.getState().setStatus('未检测到需要拆分的连音', 'idle');
      setTimeout(() => useStatusStore.getState().setIdle(), 2000);
      return;
    }

    // Only estimate pitch for newly split notes
    const splitIndices = Array.from(isSplitNote);
    const splitWgs = splitIndices.map((i) => ({
      startPhIndex: 0, phCount: 0,
      startTime: newNotes[i].startTime, duration: newNotes[i].duration,
      noteStartIndex: 0, noteCount: 1,
    }));
    const estimated = estimateMidi(f0, f0Timestep, splitWgs);

    const estimatedNotes = newNotes.map((note, i) => {
      if (!isSplitNote.has(i)) return note;
      const estIdx = splitIndices.indexOf(i);
      if (estIdx < 0 || estIdx >= estimated.length) return note;
      const est = estimated[estIdx];
      if (est.isRest) return { ...note, isRest: true };
      return { ...note, midiPitch: est.midiPitch, centsOffset: est.centsOffset, isRest: false };
    });

    // Update wordGroups using index mapping (not time matching)
    const updatedWg = wordGroups.map((wg) => {
      let newStart = -1;
      let newCount = 0;
      const end = Math.min(wg.noteStartIndex + wg.noteCount, oldToNew.length);
      for (let oi = wg.noteStartIndex; oi < end; oi++) {
        const m = oldToNew[oi];
        if (newStart < 0) newStart = m.start;
        newCount += m.count;
      }
      if (newStart < 0) newStart = wg.noteStartIndex;
      return { ...wg, noteStartIndex: newStart, noteCount: Math.max(1, newCount) };
    });

    const splitCount = estimatedNotes.length - notes.length;
    updateSegmentData(currentSegmentIndex, { notes: estimatedNotes, wordGroups: updatedWg });
    useStatusStore.getState().setStatus(
      splitCount > 0 ? `拆分了 ${splitCount} 个连音` : '未检测到需要拆分的连音',
      splitCount > 0 ? 'success' : 'idle',
    );
    setTimeout(() => useStatusStore.getState().setIdle(), 2000);
  }, [segment, currentSegmentIndex, updateSegmentData]);

  const handleSnapCents = useCallback(() => {
    if (!segment?.data?.notes || selectedNoteIds.size === 0) return;
    useProjectStore.getState().pushUndoSnapshot(currentSegmentIndex);
    const notes = segment.data.notes.map((note) =>
      selectedNoteIds.has(note.id) ? { ...note, centsOffset: 0 } : note
    );
    updateSegmentData(currentSegmentIndex, { notes });
  }, [segment, selectedNoteIds, updateSegmentData, currentSegmentIndex]);


  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (ctrl && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (ctrl && e.key === 'Z') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (ctrl && e.key === 'a') {
        e.preventDefault();
        if (segment?.data?.notes) {
          const allIds = segment.data.notes.map((n) => n.id);
          useEditorStore.getState().deselectAll();
          useEditorStore.getState().addToSelection(allIds);
        }
        return;
      }

      if (!ctrl && !e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            setMode('select');
            break;
          case 's':
            setMode('split');
            break;
          case 'm':
            handleMerge();
            break;
          case 'arrowup':
            e.preventDefault();
            handlePitchUp();
            break;
          case 'arrowdown':
            e.preventDefault();
            handlePitchDown();
            break;
          case 'escape':
            useEditorStore.getState().deselectAll();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handlePitchUp, handlePitchDown, handleMerge, setMode, segment]);

  const handleSeek = useCallback(
    (time: number) => {
      seekTo(time);
    },
    [seekTo]
  );

  // --- Empty state ---
  if (!hasProject) {
    return (
      <div style={styles.emptyState}>
        <span style={styles.emptyTitle}>慢慢来，不着急</span>
        <span style={styles.emptySubtitle}>标注的每一步都算数</span>
        <div style={styles.emptyButtons}>
          <button
            style={{
              ...styles.emptyButton,
              backgroundColor: importHovered ? '#33312E' : '#2A2926',
              color: importHovered ? '#E8E5DF' : '#A09D96',
            }}
            onMouseEnter={() => setImportHovered(true)}
            onMouseLeave={() => setImportHovered(false)}
            onClick={onShowImport}
          >
            来点新数据集
          </button>
          <button
            style={{
              ...styles.emptyButton,
              backgroundColor: openHovered ? '#33312E' : '#2A2926',
              color: openHovered ? '#E8E5DF' : '#A09D96',
            }}
            onMouseEnter={() => setOpenHovered(true)}
            onMouseLeave={() => setOpenHovered(false)}
            onClick={onOpenProject}
          >
            让我们继续
          </button>
        </div>
      </div>
    );
  }

  // Derive display data
  const title = segment?.name ?? '';
  const canUndo = storeCanUndo;
  const canRedo = storeCanRedo;
  const noteCount = segment?.data?.notes?.length ?? 0;

  // Count slur notes (notes at position > 0 within a word group)
  let slurCount = 0;
  if (segment?.data) {
    const { notes, wordGroups } = segment.data;
    for (const wg of wordGroups) {
      // Each note beyond the first in a word group is a slur
      const wgNoteCount = Math.min(wg.noteCount, notes.length - wg.noteStartIndex);
      if (wgNoteCount > 1) {
        slurCount += wgNoteCount - 1;
      }
    }
  }

  // Cursor info - show hovered note pitch name
  let cursorInfo = '--';
  if (hoveredNoteId && segment?.data?.notes) {
    const hoveredNote = segment.data.notes.find((n) => n.id === hoveredNoteId);
    if (hoveredNote) {
      cursorInfo = midiToNoteName(hoveredNote.midiPitch, hoveredNote.centsOffset);
    }
  }

  return (
    <div style={styles.container}>
      <WorkspaceHeader
        title={title}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onMarkDone={handleMarkDone}
        onSave={handleSave}
        canUndo={canUndo}
        canRedo={canRedo}
      />
      <Toolbar
        mode={mode}
        onModeChange={handleModeChange}
        onMerge={handleMerge}
        onPitchUp={handlePitchUp}
        onPitchDown={handlePitchDown}
        onAutoEstimate={handleAutoEstimate}
        onAutoSlur={handleAutoSlur}
        onSnapCents={handleSnapCents}
      />
      <TrackContainer />
      <Playbar
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={audioDuration}
        cursorInfo={cursorInfo}
        noteCount={noteCount}
        slurCount={slurCount}
        onTogglePlay={togglePlay}
        onSeek={handleSeek}
      />
    </div>
  );
};

export default Workspace;
