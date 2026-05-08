import { Command, type Child } from '@tauri-apps/plugin-shell';
import type { BackendInterface } from './backendInterface';

let child: Child | null = null;
let requestId = 0;

const pending = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>();

let stdoutBuffer = '';

function handleStdoutLine(line: string) {
  line = line.trim();
  if (!line) return;
  try {
    const msg = JSON.parse(line);
    const id = msg.id;
    if (id == null) return;

    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);

    if (msg.error) {
      entry.reject(new Error(`[${msg.error.code}] ${msg.error.message}`));
    } else {
      entry.resolve(msg.result);
    }
  } catch {
    // non-JSON line — ignore
  }
}

export async function spawnPython(): Promise<void> {
  if (child) return;

  let scriptPath: string;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const cwd = await invoke<string>('get_cwd');
    console.log('[python-sidecar] Tauri CWD:', cwd);
    // In dev mode, CWD is src-tauri/. Go up one level to project root.
    const projectRoot = cwd.replace(/[\\/]src-tauri$/, '');
    const sep = projectRoot.includes('/') ? '/' : '\\';
    scriptPath = projectRoot + sep + 'src-python' + sep + 'main.py';
  } catch (e) {
    console.warn('[python-sidecar] get_cwd failed, using relative path:', e);
    scriptPath = 'src-python/main.py';
  }

  console.log('[python-sidecar] Spawning python with script:', scriptPath);
  const cmd = Command.create('python-sidecar', ['-u', scriptPath, '--dev']);

  cmd.stdout.on('data', (data: string) => {
    stdoutBuffer += data;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      handleStdoutLine(line);
    }
  });

  cmd.stderr.on('data', (data: string) => {
    console.debug('[python-sidecar stderr]', data.trim());
  });

  cmd.on('close', (payload) => {
    console.info(`[python-sidecar] exited with code ${payload.code}`);
    child = null;
    for (const [id, entry] of pending) {
      entry.reject(new Error('Python sidecar exited'));
      pending.delete(id);
    }
  });

  cmd.on('error', (err) => {
    console.error('[python-sidecar] error:', err);
    child = null;
  });

  child = await cmd.spawn();
  console.log('[python-sidecar] Process spawned, pid:', child.pid);

  // Send a ping to verify communication works
  try {
    const pingPayload = JSON.stringify({ id: 0, cmd: 'ping', params: {} }) + '\n';
    console.log('[python-sidecar] Sending ping:', pingPayload.trim());
    await child.write(pingPayload);
    console.log('[python-sidecar] Ping written to stdin');
  } catch (e) {
    console.error('[python-sidecar] Failed to write ping:', e);
  }
}

export async function killPython(): Promise<void> {
  if (!child) return;
  try {
    await child.kill();
  } catch {
    // already dead
  }
  child = null;
  for (const [id, entry] of pending) {
    entry.reject(new Error('Python sidecar killed'));
    pending.delete(id);
  }
}

async function sendRequest(
  cmd: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  if (!child) {
    try {
      await spawnPython();
    } catch (err) {
      console.warn('Failed to spawn Python sidecar, returning mock:', err);
      return mockResponse(cmd, params);
    }
  }

  const id = ++requestId;
  const payload = JSON.stringify({ id, cmd, params }) + '\n';

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Python sidecar request ${cmd} (id=${id}) timed out`));
    }, 30000);

    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timeout);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timeout);
        reject(e);
      },
    });

    child!.write(payload).catch((err) => {
      clearTimeout(timeout);
      pending.delete(id);
      reject(err);
    });
  });
}

function mockResponse(cmd: string, _params: Record<string, unknown>): unknown {
  switch (cmd) {
    case 'ping':
      return { pong: true };
    case 'extract_f0':
      return { f0: [], timestep: 0.01161, uv: [] };
    case 'estimate_midi':
      return { notes: [] };
    case 'detect_slur':
      return { split_points: [] };
    case 'load_audio':
      return { samples: [], sample_rate: 44100, duration: 0 };
    case 'snap_cents':
      return { midi_pitch: 60, cents_offset: 0 };
    case 'infer_ph_num':
      return { ph_num: [] };
    default:
      throw new Error(`Unknown backend command: ${cmd}`);
  }
}

export function createPythonBackend(): BackendInterface {
  return {
    async extractF0(params) {
      const result = await sendRequest('extract_f0', {
        wav_path: params.wavPath,
        method: params.algorithm,
        hop_size: params.hopSize,
        sample_rate: params.sampleRate,
        f0_min: params.f0Min,
        f0_max: params.f0Max,
      });
      const data = result as { f0: number[]; timestep: number; uv: boolean[] };
      return { f0: data.f0, timestep: data.timestep, uv: data.uv };
    },

    async estimateMidi(params) {
      const result = await sendRequest('estimate_midi', {
        f0: params.f0,
        timestep: params.timestep,
        word_groups: params.wordGroups.map((wg) => ({
          start_time: wg.startTime,
          duration: wg.duration,
        })),
        rest_uv_ratio: params.restUvRatio,
      });
      const data = result as {
        notes: { midi_pitch: number; cents_offset: number; is_rest: boolean }[];
      };
      return {
        notes: data.notes.map((n) => ({
          midiPitch: n.midi_pitch,
          centsOffset: n.cents_offset,
          isRest: n.is_rest,
        })),
      };
    },

    async detectSlur(params) {
      const result = await sendRequest('detect_slur', {
        f0: params.f0,
        timestep: params.timestep,
        word_groups: params.wordGroups.map((wg) => ({
          start_time: wg.startTime,
          duration: wg.duration,
        })),
        threshold_semitones: params.thresholdSemitones,
        min_segment_frames: params.minSegmentFrames,
      });
      const data = result as {
        split_points: { word_index: number; time: number }[];
      };
      return {
        splitPoints: data.split_points.map((sp) => ({
          wordIndex: sp.word_index,
          time: sp.time,
        })),
      };
    },

    async loadAudio(params) {
      const result = await sendRequest('load_audio', {
        wav_path: params.wavPath,
        target_sample_rate: params.targetSampleRate,
      });
      const data = result as {
        samples: number[];
        sample_rate: number;
        duration: number;
      };
      return {
        samples: data.samples,
        sampleRate: data.sample_rate,
        duration: data.duration,
      };
    },

    async snapCents(params) {
      const result = await sendRequest('snap_cents', {
        f0: params.f0,
        timestep: params.timestep,
        start_time: params.startTime,
        end_time: params.endTime,
      });
      const data = result as { midi_pitch: number; cents_offset: number };
      return {
        midiPitch: data.midi_pitch,
        centsOffset: data.cents_offset,
      };
    },

    async inferPhNum(params) {
      const result = await sendRequest('infer_ph_num', {
        ph_seq: params.phSeq,
        vowel_list: params.vowelList,
      });
      const data = result as { ph_num: number[] };
      return { phNum: data.ph_num };
    },

    async ping() {
      const result = await sendRequest('ping', {});
      const data = result as { pong: boolean };
      return { pong: data.pong };
    },
  };
}
