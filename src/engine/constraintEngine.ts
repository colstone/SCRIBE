import type { WordGroup } from './wordGroupDeriver';

interface Note {
  id: string;
  startTime: number;
  duration: number;
  midiPitch: number;
  centsOffset: number;
  isRest: boolean;
}

interface SegmentData {
  readonly phSeq: string[];
  readonly phDur: number[];
  phNum: number[];
  notes: Note[];
  wordGroups: WordGroup[];
  f0: Float32Array | null;
  f0Timestep: number;
  f0Modified: boolean;
  noteGlide: string[] | null;
}

interface ValidationError {
  code: string;
  message: string;
  noteId?: string;
}

export function validateSegment(data: SegmentData): ValidationError[] {
  const errors: ValidationError[] = [];

  // C1: sum(phNum) === phSeq.length
  const phNumSum = data.phNum.reduce((a, b) => a + b, 0);
  if (phNumSum !== data.phSeq.length) {
    errors.push({ code: 'C1', message: `ph_num 之和 (${phNumSum}) 不等于音素数量 (${data.phSeq.length})` });
  }

  // C3: 每个 word 内 note 时长之和 === word 时长
  for (let i = 0; i < data.wordGroups.length; i++) {
    const wg = data.wordGroups[i];
    const expectedDur = data.phDur.slice(wg.startPhIndex, wg.startPhIndex + wg.phCount).reduce((a, b) => a + b, 0);
    let actualNoteDur = 0;
    for (let j = 0; j < wg.noteCount; j++) {
      actualNoteDur += data.notes[wg.noteStartIndex + j].duration;
    }
    if (Math.abs(actualNoteDur - expectedDur) > 1e-6) {
      errors.push({ code: 'C3', message: `Word ${i}: note 时长之和 (${actualNoteDur.toFixed(6)}) != word 时长 (${expectedDur.toFixed(6)})` });
    }
  }

  // C6: 每个 note 时长 >= f0Timestep
  for (const note of data.notes) {
    if (note.duration < data.f0Timestep && data.f0Timestep > 0) {
      errors.push({ code: 'C6', message: `Note ${note.id}: 时长 (${note.duration}) < F0 帧间隔`, noteId: note.id });
    }
  }

  // C7: 音高范围 24-108
  for (const note of data.notes) {
    if (!note.isRest && (note.midiPitch < 24 || note.midiPitch > 108)) {
      errors.push({ code: 'C7', message: `Note ${note.id}: 音高 ${note.midiPitch} 超出范围 [24, 108]`, noteId: note.id });
    }
  }

  return errors;
}
