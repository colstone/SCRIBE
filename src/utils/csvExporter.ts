// ============================================================================
// SCRIBE - CSV Exporter for variance-ready transcriptions.csv
// ============================================================================

export interface ExportSegment {
  name: string;
  phSeq: string[];
  phDur: number[];
  phNum: number[];
  noteSeq: string[];
  noteDur: number[];
  noteSlur: number[];
  f0Seq: number[];
  f0Timestep: number;
  noteGlide?: string[];
}

/**
 * Escape a CSV field value.
 * If the value contains commas, double-quotes, or newlines, wrap it in
 * double-quotes and escape internal double-quotes by doubling them.
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Export segments to DiffSinger variance-ready transcriptions.csv format.
 *
 * Column order: name, ph_seq, ph_dur, ph_num, note_seq, note_dur, note_slur,
 *               f0_seq, f0_timestep [, note_glide]
 *
 * - Durations use 6 decimal places
 * - F0 values use 1 decimal place
 * - Array values are space-separated within their field
 * - Rest notes use "rest" as the note_seq value
 */
export function exportTranscriptionsCsv(segments: ExportSegment[]): string {
  if (segments.length === 0) return '';

  // Determine if any segment has noteGlide
  const hasNoteGlide = segments.some((seg) => seg.noteGlide != null && seg.noteGlide.length > 0);

  // Build header
  const headerCols = [
    'name',
    'ph_seq',
    'ph_dur',
    'ph_num',
    'note_seq',
    'note_dur',
    'note_slur',
    'f0_seq',
    'f0_timestep',
  ];
  if (hasNoteGlide) {
    headerCols.push('note_glide');
  }

  const lines: string[] = [headerCols.join(',')];

  for (const seg of segments) {
    const phSeqStr = seg.phSeq.join(' ');
    const phDurStr = seg.phDur.map((d) => d.toFixed(6)).join(' ');
    const phNumStr = seg.phNum.map((n) => String(n)).join(' ');
    const noteSeqStr = seg.noteSeq.join(' ');
    const noteDurStr = seg.noteDur.map((d) => d.toFixed(6)).join(' ');
    const noteSlurStr = seg.noteSlur.map((s) => String(s)).join(' ');
    const f0SeqStr = seg.f0Seq.map((f) => f.toFixed(1)).join(' ');
    const f0TimestepStr = seg.f0Timestep.toFixed(6);

    const fields: string[] = [
      escapeCsvField(seg.name),
      escapeCsvField(phSeqStr),
      escapeCsvField(phDurStr),
      escapeCsvField(phNumStr),
      escapeCsvField(noteSeqStr),
      escapeCsvField(noteDurStr),
      escapeCsvField(noteSlurStr),
      escapeCsvField(f0SeqStr),
      escapeCsvField(f0TimestepStr),
    ];

    if (hasNoteGlide) {
      const noteGlideStr = seg.noteGlide ? seg.noteGlide.join(' ') : '';
      fields.push(escapeCsvField(noteGlideStr));
    }

    lines.push(fields.join(','));
  }

  return lines.join('\n') + '\n';
}
