// ============================================================================
// SCRIBE - Project File Read/Write (.scribe.json)
// ============================================================================

import type { Project, Segment, SegmentStatus, Note, WordGroup } from '../types';

/** Current project file format version. */
const CURRENT_VERSION = '1.0';

/** Suffix appended during atomic write. */
const TMP_SUFFIX = '.tmp';

// ============================================================================
// Serialization types (what gets written to disk)
// ============================================================================

/**
 * Serialized segment: excludes phSeq and phDur (those come from CSV)
 * and converts non-JSON-safe types.
 */
interface SerializedSegment {
  name: string;
  wavPath: string;
  status: SegmentStatus;
  audioDuration: number;
  data: {
    phNum: number[];
    notes: Note[];
    wordGroups: WordGroup[];
    f0: number[] | null;
    f0Timestep: number;
    f0Modified: boolean;
    noteGlide: string[] | null;
  };
}

interface SerializedProject {
  version: string;
  name: string;
  csvPath: string;
  wavsDir: string;
  vowelList: string[];
  phNumPreset: string | null;
  f0Algorithm: 'parselmouth' | 'rmvpe' | 'fcpe';
  f0Config: {
    hopSize: number;
    sampleRate: number;
    f0Min: number;
    f0Max: number;
  };
  segments: SerializedSegment[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Tauri FS helpers (with localStorage fallback for dev)
// ============================================================================

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tmpPath = filePath + TMP_SUFFIX;
  let hasTauri = false;
  try {
    const { writeTextFile, remove, rename } = await import('@tauri-apps/plugin-fs');
    hasTauri = true;
    // Write to temporary file first
    await writeTextFile(tmpPath, content);
    // Attempt to remove old file (may not exist on first save)
    try {
      await remove(filePath);
    } catch {
      // File may not exist yet -- that's fine
    }
    // Rename tmp to final
    await rename(tmpPath, filePath);
  } catch (err) {
    if (hasTauri) {
      throw err;
    }
    // Fallback: localStorage for development without Tauri
    console.warn('Tauri FS not available, falling back to localStorage');
    localStorage.setItem(`scribe:project:${filePath}`, content);
    localStorage.removeItem(`scribe:project:${tmpPath}`);
  }
}

async function readFile(filePath: string): Promise<string> {
  try {
    const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');

    // Crash recovery: if .tmp exists but the main file does not,
    // the previous save was interrupted -- use the tmp file.
    const tmpPath = filePath + TMP_SUFFIX;
    const tmpExists = await exists(tmpPath);
    const mainExists = await exists(filePath);

    if (tmpExists && !mainExists) {
      console.warn('Detected interrupted save, recovering from .tmp file');
      const { rename } = await import('@tauri-apps/plugin-fs');
      await rename(tmpPath, filePath);
    } else if (tmpExists && mainExists) {
      // Both exist -- the tmp is stale, remove it
      const { remove } = await import('@tauri-apps/plugin-fs');
      await remove(tmpPath);
    }

    return await readTextFile(filePath);
  } catch {
    // Fallback: localStorage
    console.warn('Tauri FS not available, falling back to localStorage');
    const tmpKey = `scribe:project:${filePath}${TMP_SUFFIX}`;
    const mainKey = `scribe:project:${filePath}`;

    const tmpData = localStorage.getItem(tmpKey);
    const mainData = localStorage.getItem(mainKey);

    if (tmpData && !mainData) {
      console.warn('Detected interrupted save in localStorage, recovering from .tmp');
      localStorage.setItem(mainKey, tmpData);
      localStorage.removeItem(tmpKey);
      return tmpData;
    } else if (tmpData && mainData) {
      localStorage.removeItem(tmpKey);
    }

    if (mainData) return mainData;
    throw new Error(`Project file not found: ${filePath}`);
  }
}

// ============================================================================
// Serialization / Deserialization
// ============================================================================

function serializeProject(project: Project): SerializedProject {
  return {
    version: CURRENT_VERSION,
    name: project.name,
    csvPath: project.csvPath,
    wavsDir: project.wavsDir,
    vowelList: project.vowelList,
    phNumPreset: project.phNumPreset,
    f0Algorithm: project.f0Algorithm,
    f0Config: { ...project.f0Config },
    segments: project.segments.map((seg) => ({
      name: seg.name,
      wavPath: seg.wavPath,
      status: seg.status,
      audioDuration: seg.audioDuration,
      data: {
        // phSeq and phDur are NOT saved -- they come from the CSV
        phNum: seg.data.phNum,
        notes: seg.data.notes,
        wordGroups: seg.data.wordGroups,
        f0: seg.data.f0 ? Array.from(seg.data.f0) : null,
        f0Timestep: seg.data.f0Timestep,
        f0Modified: seg.data.f0Modified,
        noteGlide: seg.data.noteGlide,
      },
    })),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function deserializeProject(data: SerializedProject): Project {
  return {
    name: data.name,
    csvPath: data.csvPath,
    wavsDir: data.wavsDir,
    vowelList: data.vowelList,
    phNumPreset: data.phNumPreset,
    f0Algorithm: data.f0Algorithm,
    f0Config: data.f0Config,
    segments: data.segments.map((seg) => ({
      name: seg.name,
      wavPath: seg.wavPath,
      status: seg.status,
      audioDuration: seg.audioDuration,
      data: {
        phSeq: [],   // Will be populated from CSV
        phDur: [],    // Will be populated from CSV
        phNum: seg.data.phNum,
        notes: seg.data.notes,
        wordGroups: seg.data.wordGroups,
        f0: seg.data.f0 ? new Float32Array(seg.data.f0) : null,
        f0Timestep: seg.data.f0Timestep,
        f0Modified: seg.data.f0Modified,
        noteGlide: seg.data.noteGlide,
      },
    } satisfies Segment)),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

// ============================================================================
// Migration
// ============================================================================

/**
 * Migrate project data from older versions to the current version.
 * Currently only version "1.0" exists.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateProject(data: any): any {
  if (!data.version) {
    // Pre-versioned format: assume it was a prototype and assign version
    data.version = '1.0';
  }

  // Future migrations go here:
  // if (data.version === '1.0') {
  //   // migrate from 1.0 to 1.1
  //   data.version = '1.1';
  // }

  if (data.version !== CURRENT_VERSION) {
    throw new Error(
      `Unsupported project file version: "${data.version}" (current: "${CURRENT_VERSION}")`
    );
  }

  return data;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Save a project to a .scribe.json file.
 * Uses atomic write (write .tmp then rename) to prevent data loss on crash.
 */
export async function saveProject(project: Project, filePath: string): Promise<void> {
  const serialized = serializeProject(project);
  const json = JSON.stringify(serialized, null, 2);
  await writeFileAtomic(filePath, json);
}

/**
 * Load a project from a .scribe.json file.
 * Implements crash recovery by checking for .tmp files.
 * Runs migration on loaded data.
 */
export async function loadProject(filePath: string): Promise<Project> {
  const text = await readFile(filePath);
  const raw = JSON.parse(text);
  const migrated = migrateProject(raw);
  return deserializeProject(migrated as SerializedProject);
}
