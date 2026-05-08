// ============================================================================
// SCRIBE - CSV Parser for DiffSinger transcriptions.csv
// ============================================================================

export interface RawSegment {
  name: string;
  phSeq: string[];
  phDur: number[];
  phNum?: number[];
  noteSeq?: string[];
  noteDur?: number[];
  noteSlur?: number[];
  noteGlide?: string[];
}

export interface ParseResult {
  segments: RawSegment[];
  hasPhNum: boolean;
  hasNoteSeq: boolean;
  hasNoteDur: boolean;
  hasNoteGlide: boolean;
  errors: string[];
}

/**
 * Parse a single CSV line, respecting quoted fields.
 * Handles fields wrapped in double-quotes that may contain commas or escaped quotes.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse a space-separated string into an array of numbers.
 * Returns null if any value is not a valid finite number.
 */
function parseNumberArray(value: string): number[] | null {
  if (!value.trim()) return [];
  const parts = value.trim().split(/\s+/);
  const result: number[] = [];
  for (const part of parts) {
    const num = Number(part);
    if (!Number.isFinite(num)) return null;
    result.push(num);
  }
  return result;
}

/**
 * Parse a space-separated string into an array of integers.
 * Returns null if any value is not a valid integer.
 */
function parseIntArray(value: string): number[] | null {
  if (!value.trim()) return [];
  const parts = value.trim().split(/\s+/);
  const result: number[] = [];
  for (const part of parts) {
    const num = Number(part);
    if (!Number.isInteger(num)) return null;
    result.push(num);
  }
  return result;
}

/**
 * Parse DiffSinger transcriptions.csv content.
 *
 * Required columns: name, ph_seq, ph_dur
 * Optional columns: ph_num, note_seq, note_dur, note_slur, note_glide
 *
 * - ph_seq values are space-separated phoneme tokens
 * - ph_dur values are space-separated decimal durations
 * - ph_num values are space-separated integers
 * - Empty lines are skipped
 * - Invalid numeric values are reported as errors
 */
export function parseTranscriptionsCsv(csvText: string): ParseResult {
  const errors: string[] = [];
  const segments: RawSegment[] = [];

  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0) {
    errors.push('CSV file is empty');
    return { segments, hasPhNum: false, hasNoteSeq: false, hasNoteDur: false, hasNoteGlide: false, errors };
  }

  // Find the first non-empty line as the header
  let headerLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '') {
      headerLineIndex = i;
      break;
    }
  }

  if (headerLineIndex === -1) {
    errors.push('CSV file is empty');
    return { segments, hasPhNum: false, hasNoteSeq: false, hasNoteDur: false, hasNoteGlide: false, errors };
  }

  const headers = parseCsvLine(lines[headerLineIndex]).map((h) => h.toLowerCase());

  // Build column index map
  const colIndex: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    colIndex[headers[i]] = i;
  }

  // Validate required columns
  const requiredCols = ['name', 'ph_seq', 'ph_dur'];
  for (const col of requiredCols) {
    if (!(col in colIndex)) {
      errors.push(`Missing required column: "${col}"`);
    }
  }

  if (errors.length > 0) {
    return { segments, hasPhNum: false, hasNoteSeq: false, hasNoteDur: false, hasNoteGlide: false, errors };
  }

  // Detect optional columns
  const hasPhNum = 'ph_num' in colIndex;
  const hasNoteSeq = 'note_seq' in colIndex;
  const hasNoteDur = 'note_dur' in colIndex;
  const hasNoteSlur = 'note_slur' in colIndex;
  const hasNoteGlide = 'note_glide' in colIndex;

  // Parse data rows
  for (let lineNum = headerLineIndex + 1; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    if (line.trim() === '') continue;

    const fields = parseCsvLine(line);
    const rowLabel = `Row ${lineNum + 1}`;

    const name = fields[colIndex['name']] ?? '';
    if (!name) {
      errors.push(`${rowLabel}: missing "name" value`);
      continue;
    }

    // ph_seq: space-separated phoneme tokens
    const phSeqRaw = fields[colIndex['ph_seq']] ?? '';
    if (!phSeqRaw.trim()) {
      errors.push(`${rowLabel} (${name}): missing "ph_seq" value`);
      continue;
    }
    const phSeq = phSeqRaw.trim().split(/\s+/);

    // ph_dur: space-separated numbers
    const phDurRaw = fields[colIndex['ph_dur']] ?? '';
    if (!phDurRaw.trim()) {
      errors.push(`${rowLabel} (${name}): missing "ph_dur" value`);
      continue;
    }
    const phDur = parseNumberArray(phDurRaw);
    if (phDur === null) {
      errors.push(`${rowLabel} (${name}): invalid number in "ph_dur"`);
      continue;
    }

    if (phSeq.length !== phDur.length) {
      errors.push(`${rowLabel} (${name}): ph_seq length (${phSeq.length}) does not match ph_dur length (${phDur.length})`);
      continue;
    }

    const segment: RawSegment = { name, phSeq, phDur };

    // Optional: ph_num
    if (hasPhNum) {
      const raw = fields[colIndex['ph_num']] ?? '';
      if (raw.trim()) {
        const parsed = parseIntArray(raw);
        if (parsed === null) {
          errors.push(`${rowLabel} (${name}): invalid integer in "ph_num"`);
          continue;
        }
        segment.phNum = parsed;
      }
    }

    // Optional: note_seq
    if (hasNoteSeq) {
      const raw = fields[colIndex['note_seq']] ?? '';
      if (raw.trim()) {
        segment.noteSeq = raw.trim().split(/\s+/);
      }
    }

    // Optional: note_dur
    if (hasNoteDur) {
      const raw = fields[colIndex['note_dur']] ?? '';
      if (raw.trim()) {
        const parsed = parseNumberArray(raw);
        if (parsed === null) {
          errors.push(`${rowLabel} (${name}): invalid number in "note_dur"`);
          continue;
        }
        segment.noteDur = parsed;
      }
    }

    // Optional: note_slur
    if (hasNoteSlur) {
      const raw = fields[colIndex['note_slur']] ?? '';
      if (raw.trim()) {
        const parsed = parseIntArray(raw);
        if (parsed === null) {
          errors.push(`${rowLabel} (${name}): invalid integer in "note_slur"`);
          continue;
        }
        segment.noteSlur = parsed;
      }
    }

    // Optional: note_glide
    if (hasNoteGlide) {
      const raw = fields[colIndex['note_glide']] ?? '';
      if (raw.trim()) {
        segment.noteGlide = raw.trim().split(/\s+/);
      }
    }

    segments.push(segment);
  }

  return { segments, hasPhNum, hasNoteSeq, hasNoteDur, hasNoteGlide, errors };
}
