// ============================================================================
// SCRIBE - Display Formatting Utilities
// ============================================================================

/**
 * Format a time value in seconds to a human-readable "M:SS.d" string.
 *
 * Examples:
 *   formatTime(0)       === "0:00.0"
 *   formatTime(1.234)   === "0:01.2"
 *   formatTime(65.78)   === "1:05.7"
 *   formatTime(3661.5)  === "61:01.5"
 */
export function formatTime(seconds: number): string {
  const totalSeconds = Math.abs(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds * 10) % 10);
  const sign = seconds < 0 ? '-' : '';
  return `${sign}${minutes}:${String(secs).padStart(2, '0')}.${tenths}`;
}

/**
 * Format a duration value in seconds to a fixed 6-decimal-place string.
 *
 * Examples:
 *   formatDuration(0.052)      === "0.052000"
 *   formatDuration(1.2345678)  === "1.234568"
 *   formatDuration(0)          === "0.000000"
 */
export function formatDuration(seconds: number): string {
  return seconds.toFixed(6);
}

/**
 * Generate a simple UUID (v4-like) string.
 *
 * Uses crypto.randomUUID() when available (modern browsers and Node 19+),
 * otherwise falls back to a manual implementation.
 *
 * Example output: "550e8400-e29b-41d4-a716-446655440000"
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback: manual UUID v4 generation
  const hex = '0123456789abcdef';
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  let result = '';
  for (let i = 0; i < template.length; i++) {
    const ch = template[i];
    if (ch === 'x') {
      result += hex[Math.floor(Math.random() * 16)];
    } else if (ch === 'y') {
      // Variant bits: 10xx (8, 9, a, or b)
      result += hex[8 + Math.floor(Math.random() * 4)];
    } else {
      result += ch;
    }
  }
  return result;
}
