export interface WordGroup {
  startPhIndex: number;
  phCount: number;
  startTime: number;
  duration: number;
  noteStartIndex: number;
  noteCount: number;
}

export function deriveWordGroups(phSeq: string[], phDur: number[], phNum: number[]): WordGroup[] {
  const groups: WordGroup[] = [];
  let phIndex = 0;
  let timeOffset = 0;

  for (const count of phNum) {
    let duration = 0;
    for (let i = 0; i < count; i++) {
      duration += phDur[phIndex + i];
    }
    groups.push({
      startPhIndex: phIndex,
      phCount: count,
      startTime: timeOffset,
      duration: duration,
      noteStartIndex: -1,
      noteCount: 0,
    });
    phIndex += count;
    timeOffset += duration;
  }

  return groups;
}
