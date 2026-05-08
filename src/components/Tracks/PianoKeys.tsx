import React, { useState, useCallback, useMemo } from 'react';
import { isBlackKey, midiToNoteName } from '../../utils/midiUtils';

// ============================================================================
// PianoKeys
// ============================================================================

interface PianoKeysProps {
  highestMidi: number;
  lowestMidi: number;
  pixelsPerSemitone: number;
  onKeyPress: (midi: number) => void;
  onKeyRelease: () => void;
}

const WIDTH = 48;
const MONO_FONT = '"Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", monospace';

const styles = {
  container: {
    width: `${WIDTH}px`,
    backgroundColor: '#1A1918',
    flexShrink: 0,
    overflow: 'hidden',
    position: 'relative',
    userSelect: 'none',
  } as React.CSSProperties,
};

const PianoKeys: React.FC<PianoKeysProps> = ({
  highestMidi,
  lowestMidi,
  pixelsPerSemitone,
  onKeyPress,
  onKeyRelease,
}) => {
  const [pressedMidi, setPressedMidi] = useState<number | null>(null);

  const handleMouseDown = useCallback(
    (midi: number) => {
      setPressedMidi(midi);
      onKeyPress(midi);
    },
    [onKeyPress]
  );

  const handleMouseUp = useCallback(() => {
    setPressedMidi(null);
    onKeyRelease();
  }, [onKeyRelease]);

  const handleMouseLeave = useCallback(() => {
    if (pressedMidi !== null) {
      setPressedMidi(null);
      onKeyRelease();
    }
  }, [pressedMidi, onKeyRelease]);

  const keys = useMemo(() => {
    const result: React.ReactNode[] = [];

    for (let midi = highestMidi; midi >= lowestMidi; midi--) {
      const isBlack = isBlackKey(midi);
      const isC = midi % 12 === 0;
      const y = (highestMidi - midi) * pixelsPerSemitone;
      const name = midiToNoteName(midi);
      const isPressed = pressedMidi === midi;

      const rowStyle: React.CSSProperties = {
        position: 'absolute',
        top: `${y}px`,
        left: 0,
        width: `${WIDTH}px`,
        height: `${pixelsPerSemitone}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: '5px',
        boxSizing: 'border-box',
        backgroundColor: isPressed
          ? '#33312E'
          : isBlack
            ? 'rgba(255,255,255,0.02)'
            : 'transparent',
        borderBottom: isC ? '1px solid #3D3A36' : 'none',
        cursor: 'pointer',
      };

      const labelStyle: React.CSSProperties = isC
        ? {
            fontSize: '8px',
            fontFamily: MONO_FONT,
            fontWeight: 500,
            color: '#E8E5DF',
            lineHeight: '1',
          }
        : isBlack
          ? {
              fontSize: '7px',
              fontFamily: MONO_FONT,
              fontWeight: 400,
              color: '#5F5D58',
              lineHeight: '1',
            }
          : {
              fontSize: '8px',
              fontFamily: MONO_FONT,
              fontWeight: 400,
              color: '#A09D96',
              lineHeight: '1',
            };

      result.push(
        <div
          key={midi}
          style={rowStyle}
          onMouseDown={() => handleMouseDown(midi)}
          onMouseUp={handleMouseUp}
        >
          <span style={labelStyle}>{name}</span>
        </div>
      );
    }

    return result;
  }, [highestMidi, lowestMidi, pixelsPerSemitone, pressedMidi, handleMouseDown, handleMouseUp]);

  const totalHeight = (highestMidi - lowestMidi + 1) * pixelsPerSemitone;

  return (
    <div
      style={{
        ...styles.container,
        height: `${totalHeight}px`,
      }}
      onMouseLeave={handleMouseLeave}
    >
      {keys}
    </div>
  );
};

export default PianoKeys;
