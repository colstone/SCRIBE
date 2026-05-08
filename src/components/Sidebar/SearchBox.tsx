import React, { useState, useCallback } from 'react';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
}

const styles = {
  container: {
    padding: '6px 10px',
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '5px 8px',
    borderRadius: '5px',
    backgroundColor: '#2A2926',
    border: '0.5px solid #2A2926',
    color: '#E8E5DF',
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif',
    outline: 'none',
    boxSizing: 'border-box',
  } as React.CSSProperties,

  inputFocused: {
    border: '0.5px solid #6DB0F2',
  } as React.CSSProperties,
};

const SearchBox: React.FC<SearchBoxProps> = ({ value, onChange }) => {
  const [focused, setFocused] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <div style={styles.container}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="搜索片段..."
        style={{
          ...styles.input,
          ...(focused ? styles.inputFocused : {}),
        }}
      />
    </div>
  );
};

export default SearchBox;
