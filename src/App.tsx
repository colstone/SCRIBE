import React, { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import Workspace from './components/Workspace/Workspace';
import ImportDialog from './components/Dialogs/ImportDialog';
import ConfirmDialog from './components/Dialogs/ConfirmDialog';
import PhNumGenerationDialog from './components/Dialogs/PhNumGenerationDialog';
import SettingsDialog from './components/Dialogs/SettingsDialog';
import AboutDialog from './components/Dialogs/AboutDialog';
import LicensesDialog from './components/Dialogs/LicensesDialog';
import { useProjectStore } from './stores/projectStore';
import { useEditorStore } from './stores/editorStore';
import { useAudioStore } from './stores/audioStore';
import { readTextFile, readDir, writeTextFile } from '@tauri-apps/plugin-fs';
import { open as showOpenDialog, save as showSaveDialog } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { parseTranscriptionsCsv } from './utils/csvParser';
import { loadProject as loadProjectFile } from './utils/projectFile';
import { noteNameToMidi } from './utils/midiUtils';
import { inferPhNum } from './engine/phNumInfer';
import { deriveWordGroups } from './engine/wordGroupDeriver';
import { PH_NUM_PRESETS } from './data/phNumPresets';
import { useSettingsStore, AppSettings } from './stores/settingsStore';
import { useStatusStore } from './stores/statusStore';
import { exportTranscriptionsCsv, ExportSegment } from './utils/csvExporter';
import type { Project, Segment, SegmentData, Note, WordGroup } from './types';

const fontSans = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif';

const appStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  background: '#1A1918',
  fontFamily: fontSans,
  color: '#E8E5DF',
};

export default function App() {
  const project = useProjectStore((s) => s.project);
  const currentSegmentIndex = useProjectStore((s) => s.currentSegmentIndex);
  const setCurrentSegment = useProjectStore((s) => s.setCurrentSegment);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showPhNumDialog, setShowPhNumDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showLicensesDialog, setShowLicensesDialog] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const segments = project?.segments ?? [];
  const doneCount = segments.filter((s) => s.status === 'done').length;
  const currentWavPath = segments[currentSegmentIndex]?.wavPath ?? '';

  // Load audio when the selected segment changes
  useEffect(() => {
    if (currentWavPath) {
      useAudioStore.getState().loadAudio(currentWavPath);
    } else {
      useAudioStore.getState().cleanup();
    }
  }, [currentSegmentIndex, currentWavPath]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      useAudioStore.getState().cleanup();
    };
  }, []);

  // Space bar to toggle play/pause, Shift+W/S for prev/next segment
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        useAudioStore.getState().togglePlay();
        return;
      }

      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'W' || e.key === 'w') {
          e.preventDefault();
          const ps = useProjectStore.getState();
          if (ps.project && ps.currentSegmentIndex > 0) {
            ps.setCurrentSegment(ps.currentSegmentIndex - 1);
          }
          return;
        }
        if (e.key === 'S' || e.key === 's') {
          e.preventDefault();
          const ps = useProjectStore.getState();
          if (ps.project) {
            const maxIdx = ps.project.segments.length - 1;
            if (ps.currentSegmentIndex < maxIdx) {
              ps.updateSegmentStatus(ps.currentSegmentIndex, 'done');
              ps.setCurrentSegment(ps.currentSegmentIndex + 1);
            }
          }
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Prevent WebView default Ctrl+Wheel zoom (so trackpad pinch reaches our handler)
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  }, []);

  // Listen for native menu events
  useEffect(() => {
    let disposed = false;
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      unlisteners.push(await listen('menu-import', () => setShowImportDialog(true)));
      unlisteners.push(await listen('menu-open', handleOpenProject));
      unlisteners.push(await listen('menu-save', () => useProjectStore.getState().saveProject()));
      unlisteners.push(await listen('menu-undo', () => useProjectStore.getState().undo()));
      unlisteners.push(await listen('menu-redo', () => useProjectStore.getState().redo()));
      unlisteners.push(await listen('menu-select-all', () => {
        const seg = useProjectStore.getState().getCurrentSegment();
        if (seg?.data?.notes) {
          const editor = useEditorStore.getState();
          editor.deselectAll();
          editor.addToSelection(seg.data.notes.map((n) => n.id));
        }
      }));
      unlisteners.push(await listen('menu-phnum', () => setShowPhNumDialog(true)));
      unlisteners.push(await listen('menu-rebuild-notes', () => rebuildNotes()));
      unlisteners.push(await listen('menu-settings', () => setShowSettingsDialog(true)));
      unlisteners.push(await listen('menu-about', () => setShowAboutDialog(true)));
      unlisteners.push(await listen('menu-licenses', () => setShowLicensesDialog(true)));
      unlisteners.push(await listen('menu-extract-all-f0', () => {
        if (!useProjectStore.getState().project) return;
        setConfirmDialog({
          title: '提取所有 F0',
          message: '此操作会重新提取所有 WAV 的 F0，耗时较长，确定执行？',
          onConfirm: () => extractAllF0(),
        });
      }));
      unlisteners.push(await listen('menu-export', handleExportCsv));
      unlisteners.push(await listen('menu-prev-segment', () => {
        const ps = useProjectStore.getState();
        if (!ps.project || ps.currentSegmentIndex <= 0) return;
        ps.setCurrentSegment(ps.currentSegmentIndex - 1);
      }));
      unlisteners.push(await listen('menu-next-segment', () => {
        const ps = useProjectStore.getState();
        if (!ps.project) return;
        const maxIdx = ps.project.segments.length - 1;
        if (ps.currentSegmentIndex >= maxIdx) return;
        ps.updateSegmentStatus(ps.currentSegmentIndex, 'done');
        ps.setCurrentSegment(ps.currentSegmentIndex + 1);
      }));
      unlisteners.push(await listen('menu-zoom-in', () => {
        useEditorStore.getState().zoom(1.25, 0, 0);
      }));
      unlisteners.push(await listen('menu-zoom-out', () => {
        useEditorStore.getState().zoom(0.8, 0, 0);
      }));
      unlisteners.push(await listen('menu-zoom-fit', () => {
        const seg = useProjectStore.getState().getCurrentSegment();
        if (seg) useEditorStore.getState().zoomToFit(seg.audioDuration, window.innerWidth - 200);
      }));
    };

    setup().then(() => {
      if (disposed) unlisteners.forEach((fn) => fn());
    });
    return () => { disposed = true; unlisteners.forEach((fn) => fn()); };
  }, []);

  const handleExportCsv = useCallback(async () => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    const filePath = await showSaveDialog({
      title: '导出 CSV',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (!filePath) return;

    try {
      const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const midiToNote = (midi: number, cents: number) => {
        const rounded = Math.round(midi);
        const idx = rounded % 12;
        const oct = Math.floor(rounded / 12) - 1;
        const name = NOTE_NAMES[idx] + oct;
        if (cents > 0) return `${name}+${cents}`;
        if (cents < 0) return `${name}${cents}`;
        return name;
      };

      const exportSegs: ExportSegment[] = project.segments.map((seg) => {
        const { phSeq, phDur, notes, wordGroups, f0, f0Timestep } = seg.data;
        const phNum = wordGroups.map((wg) => wg.phCount);
        const noteSeq: string[] = [];
        const noteDur: number[] = [];
        const noteSlur: number[] = [];

        for (const wg of wordGroups) {
          for (let ni = 0; ni < wg.noteCount; ni++) {
            const noteIdx = wg.noteStartIndex + ni;
            if (noteIdx >= notes.length) break;
            const note = notes[noteIdx];
            noteSeq.push(note.isRest ? 'rest' : midiToNote(note.midiPitch, note.centsOffset));
            noteDur.push(note.duration);
            noteSlur.push(ni > 0 ? 1 : 0);
          }
        }

        const f0Seq: number[] = f0 ? Array.from(f0) : [];

        return {
          name: seg.name,
          phSeq: [...phSeq],
          phDur: [...phDur],
          phNum,
          noteSeq,
          noteDur,
          noteSlur,
          f0Seq,
          f0Timestep,
        };
      });

      const csv = exportTranscriptionsCsv(exportSegs);
      await writeTextFile(filePath, csv);
      useStatusStore.getState().setStatus('导出成功', 'success');
      setTimeout(() => useStatusStore.getState().setIdle(), 2000);
    } catch (err) {
      console.error('Export failed:', err);
      useStatusStore.getState().setStatus(`导出失败: ${err}`, 'error');
      setTimeout(() => useStatusStore.getState().setIdle(), 5000);
    }
  }, []);

  const handleOpenProject = useCallback(async () => {
    try {
      const selected = await showOpenDialog({
        title: '打开项目',
        filters: [{ name: 'SCRIBE Project', extensions: ['scribe.json'] }],
      });
      if (!selected) return;
      const filePath = typeof selected === 'string' ? selected : selected as unknown as string;
      if (!filePath) return;

      useStatusStore.getState().setStatus('正在加载项目...', 'working');
      const project = await loadProjectFile(filePath);

      // Re-populate phSeq/phDur from CSV
      if (project.csvPath) {
        try {
          const csvText = await readTextFile(project.csvPath);
          const parsed = parseTranscriptionsCsv(csvText);
          const csvMap = new Map(parsed.segments.map((s) => [s.name, s]));
          for (const seg of project.segments) {
            const raw = csvMap.get(seg.name);
            if (raw) {
              (seg.data as any).phSeq = raw.phSeq;
              (seg.data as any).phDur = raw.phDur;
            }
          }
        } catch (csvErr) {
          console.warn('Could not reload CSV for phSeq/phDur:', csvErr);
        }
      }

      const projStore = useProjectStore.getState();
      projStore.loadProject(project);
      projStore.setProjectFilePath(filePath);

      // Sync f0Algorithm to settings
      const algoMap: Record<string, AppSettings['f0Algorithm']> = {
        'parselmouth': 'parselmouth-rust',
        'rmvpe': 'rmvpe',
        'fcpe': 'fcpe',
      };
      useSettingsStore.getState().update({
        f0Algorithm: algoMap[project.f0Algorithm] ?? 'parselmouth-rust',
      });

      useStatusStore.getState().setStatus('项目已加载', 'success');
      setTimeout(() => useStatusStore.getState().setIdle(), 2000);
    } catch (err) {
      console.error('Open project failed:', err);
      useStatusStore.getState().setStatus(`打开失败: ${err}`, 'error');
      setTimeout(() => useStatusStore.getState().setIdle(), 5000);
    }
  }, []);

  const handleImport = useCallback(
    async (csvPath: string, wavsDir: string, f0Algorithm: string) => {
      setShowImportDialog(false);
      try {
        const csvText = await readTextFile(csvPath);
        const parsed = parseTranscriptionsCsv(csvText);

        if (parsed.errors.length > 0) {
          console.error('CSV parse errors:', parsed.errors);
        }
        if (parsed.segments.length === 0) {
          console.error('No segments found in CSV');
          return;
        }

        const defaultVowels = ['a', 'e', 'i', 'o', 'u', 'AP', 'SP'];

        const wavFiles = await readDir(wavsDir);
        const wavSet = new Set(
          wavFiles
            .filter((e) => e.name?.endsWith('.wav'))
            .map((e) => e.name!.replace(/\.wav$/, '')),
        );

        const segments: Segment[] = parsed.segments.map((raw) => {
          const phNum = raw.phNum ?? inferPhNum(raw.phSeq, defaultVowels);
          const wordGroups = deriveWordGroups(raw.phSeq, raw.phDur, phNum);

          const totalDuration = raw.phDur.reduce((a, b) => a + b, 0);

          let notes: Note[];
          if (raw.noteSeq && raw.noteDur && raw.noteSeq.length === raw.noteDur.length) {
            let t = 0;
            notes = raw.noteSeq.map((name, idx) => {
              const dur = raw.noteDur![idx];
              const midi = noteNameToMidi(name);
              const isRest = midi === null;
              const note: Note = {
                id: `${raw.name}_n${idx}`,
                startTime: t,
                duration: dur,
                midiPitch: midi ?? 0,
                centsOffset: 0,
                isRest,
              };
              t += dur;
              return note;
            });
          } else {
            notes = wordGroups.map((wg, idx) => ({
              id: `${raw.name}_n${idx}`,
              startTime: wg.startTime,
              duration: wg.duration,
              midiPitch: 60,
              centsOffset: 0,
              isRest: raw.phSeq[wg.startPhIndex] === 'SP',
            }));
          }

          const linkedGroups: WordGroup[] = wordGroups.map((wg, idx) => {
            let noteStart = 0;
            let noteCount = 0;
            for (let ni = 0; ni < notes.length; ni++) {
              const ne = notes[ni].startTime + notes[ni].duration;
              if (notes[ni].startTime >= wg.startTime && notes[ni].startTime < wg.startTime + wg.duration) {
                if (noteCount === 0) noteStart = ni;
                noteCount++;
              }
            }
            return { ...wg, noteStartIndex: noteStart, noteCount: Math.max(1, noteCount) };
          });

          const data: SegmentData = {
            phSeq: raw.phSeq,
            phDur: raw.phDur,
            phNum,
            notes,
            wordGroups: linkedGroups,
            f0: null,
            f0Timestep: 512 / 44100,
            f0Modified: false,
            noteGlide: null,
          };

          const hasWav = wavSet.has(raw.name);
          const separator = wavsDir.includes('\\') ? '\\' : '/';
          const wavPath = hasWav ? `${wavsDir}${separator}${raw.name}.wav` : '';

          return {
            name: raw.name,
            wavPath,
            status: 'todo' as const,
            audioDuration: totalDuration,
            data,
            undoStack: [],
            redoStack: [],
          };
        });

        const project: Project = {
          name: csvPath.split(/[\\/]/).pop()?.replace('.csv', '') ?? 'Untitled',
          csvPath,
          wavsDir,
          vowelList: defaultVowels,
          phNumPreset: null,
          f0Algorithm: f0Algorithm as 'parselmouth' | 'rmvpe' | 'fcpe',
          f0Config: { hopSize: 441, sampleRate: 44100, f0Min: 40, f0Max: 2000 },
          segments,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        useProjectStore.getState().loadProject(project);

        // Sync f0Algorithm to settings
        const algoMap: Record<string, AppSettings['f0Algorithm']> = {
          'parselmouth': 'parselmouth-rust',
          'rmvpe': 'rmvpe',
          'fcpe': 'fcpe',
        };
        useSettingsStore.getState().update({
          f0Algorithm: algoMap[f0Algorithm] ?? 'parselmouth-rust',
        });

        if (!parsed.hasPhNum) {
          setShowPhNumDialog(true);
        }
      } catch (err) {
        console.error('Import failed:', err);
      }
    },
    [],
  );

  const handleSegmentSelect = useCallback(
    (index: number) => {
      setCurrentSegment(index);
    },
    [setCurrentSegment],
  );

  const handlePhNumConfirm = useCallback(
    (vowelList: string[], _presetName: string | null) => {
      setShowPhNumDialog(false);
      if (!project) return;

      const projStore = useProjectStore.getState();
      const updatedSegments = project.segments.map((seg) => {
        const phNum = inferPhNum(seg.data.phSeq, vowelList);
        const wordGroups = deriveWordGroups(seg.data.phSeq, seg.data.phDur, phNum);

        // Rebuild notes from new wordGroups (one note per group)
        const notes: Note[] = wordGroups.map((wg, idx) => ({
          id: `${seg.name}_n${idx}`,
          startTime: wg.startTime,
          duration: wg.duration,
          midiPitch: 60,
          centsOffset: 0,
          isRest: seg.data.phSeq[wg.startPhIndex] === 'SP',
        }));

        const linkedGroups: WordGroup[] = wordGroups.map((wg, idx) => ({
          ...wg,
          noteStartIndex: idx,
          noteCount: 1,
        }));

        return {
          ...seg,
          data: {
            ...seg.data,
            phNum,
            notes,
            wordGroups: linkedGroups,
          },
        };
      });

      const updatedProject: Project = {
        ...project,
        vowelList: vowelList,
        segments: updatedSegments,
        updatedAt: new Date().toISOString(),
      };

      projStore.loadProject(updatedProject);
    },
    [project],
  );

  const rebuildNotes = useCallback(() => {
    const projStore = useProjectStore.getState();
    const proj = projStore.project;
    if (!proj) return;

    const vowels = proj.vowelList;
    const updatedSegments = proj.segments.map((seg) => {
      const phNum = inferPhNum(seg.data.phSeq, vowels);
      const wordGroups = deriveWordGroups(seg.data.phSeq, seg.data.phDur, phNum);

      const notes: Note[] = wordGroups.map((wg, idx) => ({
        id: `${seg.name}_n${idx}`,
        startTime: wg.startTime,
        duration: wg.duration,
        midiPitch: 60,
        centsOffset: 0,
        isRest: seg.data.phSeq[wg.startPhIndex] === 'SP',
      }));

      const linkedGroups: WordGroup[] = wordGroups.map((wg, idx) => ({
        ...wg,
        noteStartIndex: idx,
        noteCount: 1,
      }));

      return {
        ...seg,
        data: { ...seg.data, phNum, notes, wordGroups: linkedGroups },
      };
    });

    projStore.loadProject({
      ...proj,
      segments: updatedSegments,
      updatedAt: new Date().toISOString(),
    });
    useStatusStore.getState().setStatus('音符已重建', 'success');
    setTimeout(() => useStatusStore.getState().setIdle(), 2000);
  }, []);

  const extractAllF0 = useCallback(async () => {
    const projStore = useProjectStore.getState();
    const proj = projStore.project;
    if (!proj) return;

    const settings = useSettingsStore.getState();
    const total = proj.segments.length;
    let processed = 0;

    useStatusStore.getState().setStatus(`提取所有 F0...（0/${total}）`, 'working');

    try {
      const { invoke } = await import('@tauri-apps/api/core');

      for (let i = 0; i < total; i++) {
        const seg = proj.segments[i];
        if (!seg.wavPath) {
          processed++;
          continue;
        }

        useStatusStore.getState().setStatus(`提取所有 F0...（${processed}/${total}）`, 'working');

        try {
          let result: { f0: number[]; timestep: number };

          if (settings.f0Algorithm === 'rmvpe') {
            result = await invoke('extract_f0_rmvpe', {
              wavPath: seg.wavPath,
            }) as { f0: number[]; timestep: number };
          } else if (settings.f0Algorithm === 'fcpe') {
            result = await invoke('extract_f0_fcpe', {
              wavPath: seg.wavPath,
            }) as { f0: number[]; timestep: number };
          } else {
            result = await invoke('extract_f0', {
              wavPath: seg.wavPath,
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

          if (result.f0.length > 0) {
            let f0Data = new Float32Array(result.f0);
            if (settings.f0MedianFilter) {
              const size = settings.f0MedianFilterSize;
              const half = Math.floor(size / 2);
              const out = new Float32Array(f0Data.length);
              const buf: number[] = new Array(size);
              for (let fi = 0; fi < f0Data.length; fi++) {
                let count = 0;
                for (let j = -half; j <= half; j++) {
                  const idx = fi + j;
                  if (idx >= 0 && idx < f0Data.length && f0Data[idx] > 0) {
                    buf[count++] = f0Data[idx];
                  }
                }
                if (count === 0) { out[fi] = 0; }
                else {
                  const slice = buf.slice(0, count).sort((a, b) => a - b);
                  out[fi] = slice[Math.floor(count / 2)];
                }
              }
              f0Data = out;
            }
            projStore.updateSegmentData(i, {
              f0: f0Data,
              f0Timestep: result.timestep,
            });
          }
        } catch (err) {
          console.warn(`F0 extraction failed for ${seg.name}:`, err);
        }

        processed++;
      }

      useStatusStore.getState().setStatus(`提取所有 F0 完成（${total}/${total}）`, 'success');
      setTimeout(() => useStatusStore.getState().setIdle(), 3000);
    } catch (err) {
      console.error('Batch F0 extraction failed:', err);
      useStatusStore.getState().setStatus('批量 F0 提取失败', 'error');
      setTimeout(() => useStatusStore.getState().setIdle(), 3000);
    }
  }, []);

  const sidebarSegments = segments.map((seg) => ({
    name: seg.name,
    status: seg.status,
    noteCount: seg.data.notes.length,
    slurCount: 0,
    duration: formatSegDuration(seg.audioDuration),
  }));

  const rawScale = useSettingsStore((s) => s.uiScale);
  const uiScale = (rawScale > 0 && rawScale <= 3) ? rawScale : 1.0;

  useEffect(() => {
    import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => {
      getCurrentWebview().setZoom(uiScale).catch(() => {});
    }).catch(() => {});
  }, [uiScale]);

  useEffect(() => {
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      const title = project ? `SCRIBE • ${project.name}` : 'SCRIBE';
      getCurrentWindow().setTitle(title).catch(() => {});
    }).catch(() => {});
  }, [project?.name]);

  return (
    <div style={appStyle} onContextMenu={(e) => e.preventDefault()}>
      {project ? (
        <>
          <Sidebar
            projectName={project.name}
            segments={sidebarSegments}
            selectedIndex={currentSegmentIndex}
            onSelect={handleSegmentSelect}
            onCloseProject={() => useProjectStore.getState().closeProject()}
            doneCount={doneCount}
            totalDuration={formatSegDuration(
              segments.reduce((sum, s) => sum + s.audioDuration, 0),
            )}
          />
          <Workspace hasProject={true} onShowImport={() => setShowImportDialog(true)} />
        </>
      ) : (
        <>
          <Sidebar
            projectName=""
            segments={[]}
            selectedIndex={-1}
            onSelect={() => {}}
            onCloseProject={() => {}}
            doneCount={0}
            totalDuration="0:00"
          />
          <Workspace hasProject={false} onShowImport={() => setShowImportDialog(true)} onOpenProject={handleOpenProject} />
        </>
      )}

      {showImportDialog && (
        <ImportDialog
          onImport={handleImport}
          onCancel={() => setShowImportDialog(false)}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={() => {
            confirmDialog.onConfirm();
            setConfirmDialog(null);
          }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {showPhNumDialog && project && (
        <PhNumGenerationDialog
          phSeq={(() => {
            const all: string[] = [];
            for (const seg of segments) {
              for (const ph of seg.data.phSeq) {
                all.push(ph);
              }
            }
            return all;
          })()}
          presets={PH_NUM_PRESETS}
          onConfirm={handlePhNumConfirm}
          onCancel={() => setShowPhNumDialog(false)}
        />
      )}

      {showSettingsDialog && (
        <SettingsDialog onClose={() => setShowSettingsDialog(false)} />
      )}

      {showAboutDialog && (
        <AboutDialog onClose={() => setShowAboutDialog(false)} />
      )}

      {showLicensesDialog && (
        <LicensesDialog onClose={() => setShowLicensesDialog(false)} />
      )}
    </div>
  );
}

function formatSegDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
