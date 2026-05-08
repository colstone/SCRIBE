/// Decode gaussian-blurred probability distribution to continuous MIDI values.
/// probs: [T, n_bins] row-major. Returns (midi_values [T], is_rest [T]).
pub fn decode_gaussian_blurred_probs(
    probs: &[f32], t: usize, n_bins: usize,
    vmin: f32, vmax: f32, deviation: f32, threshold: f32,
) -> (Vec<f32>, Vec<bool>) {
    let interval = (vmax - vmin) / (n_bins as f32 - 1.0);
    let width = (3.0 * deviation / interval) as usize;

    let mut values = vec![0.0f32; t];
    let mut rest = vec![false; t];

    for frame in 0..t {
        let row = &probs[frame * n_bins..(frame + 1) * n_bins];

        let mut max_val = f32::NEG_INFINITY;
        let mut center = 0usize;
        for i in 0..n_bins {
            if row[i] > max_val {
                max_val = row[i];
                center = i;
            }
        }

        if max_val < threshold {
            rest[frame] = true;
            continue;
        }

        let start = center.saturating_sub(width);
        let end = (center + width + 1).min(n_bins);

        let mut weighted_sum = 0.0f32;
        let mut weight_sum = 0.0f32;
        for i in start..end {
            let bin_value = i as f32 * interval + vmin;
            weighted_sum += row[i] * bin_value;
            weight_sum += row[i];
        }

        if weight_sum > 0.0 {
            values[frame] = weighted_sum / weight_sum;
        }
    }

    (values, rest)
}

/// Decode boundary probabilities to frame-to-note alignment.
/// bounds: [T]. Returns frame2note [T] (0-indexed note indices, -1 for invalid).
pub fn decode_bounds_to_alignment(bounds: &[f32], t: usize) -> Vec<i32> {
    let mut cumsum = vec![0.0f32; t];
    cumsum[0] = bounds[0];
    for i in 1..t {
        cumsum[i] = cumsum[i - 1] + bounds[i];
    }

    let mut rounded = vec![0i64; t];
    for i in 0..t { rounded[i] = cumsum[i].round() as i64; }

    // Detect increments (new note boundary)
    let mut frame2note = vec![0i32; t];
    let mut note_idx = 0i32;
    // First frame always starts a new note
    frame2note[0] = note_idx;
    for i in 1..t {
        if rounded[i] > rounded[i - 1] {
            note_idx += 1;
        }
        frame2note[i] = note_idx;
    }

    frame2note
}

/// Aggregate per-frame MIDI values into per-note values.
/// Returns (note_midi, note_dur_frames, note_is_rest) for each note.
pub fn decode_note_sequence(
    frame2note: &[i32], midi_values: &[f32], is_rest: &[bool], t: usize,
) -> (Vec<f32>, Vec<usize>, Vec<bool>) {
    if t == 0 { return (vec![], vec![], vec![]); }

    let n_notes = (*frame2note.iter().max().unwrap() + 1) as usize;

    let mut note_dur = vec![0usize; n_notes];
    let mut note_voiced_dur = vec![0usize; n_notes];

    for i in 0..t {
        let n = frame2note[i] as usize;
        note_dur[n] += 1;
        if !is_rest[i] { note_voiced_dur[n] += 1; }
    }

    // Per-note: histogram voting for center MIDI, then average near center
    let mut note_midi = vec![0.0f32; n_notes];
    let mut note_is_rest = vec![false; n_notes];

    for n in 0..n_notes {
        if note_dur[n] == 0 || note_voiced_dur[n] * 2 < note_dur[n] {
            note_is_rest[n] = true;
            continue;
        }

        // Histogram over 128 MIDI bins
        let mut hist = vec![0u32; 128];
        for i in 0..t {
            if frame2note[i] as usize == n && !is_rest[i] {
                let bin = midi_values[i].round() as i32;
                if bin >= 0 && bin < 128 { hist[bin as usize] += 1; }
            }
        }

        let mut best_bin = 0;
        let mut best_count = 0;
        for b in 0..128 {
            if hist[b] > best_count { best_count = hist[b]; best_bin = b; }
        }

        // Average values near center
        let center = best_bin as f32;
        let mut sum = 0.0f32;
        let mut cnt = 0u32;
        for i in 0..t {
            if frame2note[i] as usize == n && !is_rest[i] {
                if (midi_values[i] - center).abs() <= 0.5 {
                    sum += midi_values[i];
                    cnt += 1;
                }
            }
        }

        note_midi[n] = if cnt > 0 { sum / cnt as f32 } else { center };
    }

    (note_midi, note_dur, note_is_rest)
}
