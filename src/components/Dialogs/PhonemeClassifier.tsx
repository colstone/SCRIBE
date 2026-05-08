import React, { useCallback, useMemo } from 'react';

interface PhonemeClassifierProps {
  phonemes: string[];
  vowels: string[];
  onVowelsChange: (vowels: string[]) => void;
}

const FONT_MONO = '"Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", monospace';

const LOCKED_PHONEMES = new Set(['AP', 'SP']);

const styles = {
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  } as React.CSSProperties,

  tag: {
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '10px',
    fontFamily: FONT_MONO,
    cursor: 'pointer',
    userSelect: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'background-color 0.1s, color 0.1s',
  } as React.CSSProperties,

  consonant: {
    backgroundColor: '#2A2926',
    color: '#A09D96',
    border: '0.5px solid #2A2926',
  } as React.CSSProperties,

  vowel: {
    backgroundColor: 'rgba(86,156,224,0.15)',
    color: '#6DB0F2',
    border: '0.5px solid rgba(86,156,224,0.4)',
  } as React.CSSProperties,

  locked: {
    backgroundColor: 'rgba(86,156,224,0.08)',
    color: 'rgba(109,176,242,0.5)',
    border: '0.5px solid rgba(86,156,224,0.2)',
    cursor: 'default',
  } as React.CSSProperties,
};

const PhonemeClassifier: React.FC<PhonemeClassifierProps> = ({
  phonemes,
  vowels,
  onVowelsChange,
}) => {
  const vowelSet = useMemo(() => new Set(vowels), [vowels]);

  const uniquePhonemes = useMemo(() => {
    const seen = new Set<string>();
    return phonemes.filter((ph) => {
      if (seen.has(ph)) return false;
      seen.add(ph);
      return true;
    });
  }, [phonemes]);

  const handleToggle = useCallback(
    (phoneme: string) => {
      if (LOCKED_PHONEMES.has(phoneme)) return;

      const newVowels = vowelSet.has(phoneme)
        ? vowels.filter((v) => v !== phoneme)
        : [...vowels, phoneme];
      onVowelsChange(newVowels);
    },
    [vowels, vowelSet, onVowelsChange]
  );

  return (
    <div style={styles.grid}>
      {uniquePhonemes.map((ph) => {
        const isLocked = LOCKED_PHONEMES.has(ph);
        const isVowel = vowelSet.has(ph);

        let tagStyle: React.CSSProperties;
        if (isLocked) {
          tagStyle = { ...styles.tag, ...styles.locked };
        } else if (isVowel) {
          tagStyle = { ...styles.tag, ...styles.vowel };
        } else {
          tagStyle = { ...styles.tag, ...styles.consonant };
        }

        return (
          <span
            key={ph}
            style={tagStyle}
            onClick={() => handleToggle(ph)}
          >
            {ph}
            {isLocked && <span style={{ fontSize: '9px' }}>🔒</span>}
          </span>
        );
      })}
    </div>
  );
};

export default PhonemeClassifier;
