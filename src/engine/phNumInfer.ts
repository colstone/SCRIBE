export function inferPhNum(phSeq: string[], vowelList: string[]): number[] {
  const vowelSet = new Set([...vowelList, 'AP', 'SP']);
  const phNum: number[] = [];
  let currentGroupSize = 0;

  for (let i = 0; i < phSeq.length; i++) {
    const ph = phSeq[i];
    if (vowelSet.has(ph)) {
      if (currentGroupSize > 0) {
        phNum.push(currentGroupSize);
      }
      currentGroupSize = 1;
    } else {
      currentGroupSize++;
    }
  }
  if (currentGroupSize > 0) {
    phNum.push(currentGroupSize);
  }

  return phNum;
}
