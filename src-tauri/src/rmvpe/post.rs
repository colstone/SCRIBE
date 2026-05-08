const N_CLASS: usize = 360;
const CONST: f64 = 1997.3794084376191;

/// Convert model output [T, 360] to F0 Hz values using local average.
pub fn to_local_average_f0(output: &[f32], n_frames: usize, threshold: f32) -> Vec<f64> {
    let mut cents_mapping = [0.0f64; N_CLASS];
    for i in 0..N_CLASS {
        cents_mapping[i] = 20.0 * i as f64 + CONST;
    }

    let mut f0 = Vec::with_capacity(n_frames);

    for t in 0..n_frames {
        let frame = &output[t * N_CLASS..(t + 1) * N_CLASS];

        // Find argmax and max value
        let mut max_val = frame[0];
        let mut max_idx = 0usize;
        for i in 1..N_CLASS {
            if frame[i] > max_val {
                max_val = frame[i];
                max_idx = i;
            }
        }

        if max_val <= threshold {
            f0.push(0.0);
            continue;
        }

        // Local average over center +/- 4
        let start = max_idx.saturating_sub(4);
        let end = (max_idx + 5).min(N_CLASS);
        let mut weighted_sum = 0.0f64;
        let mut weight_sum = 0.0f64;
        for i in start..end {
            let w = frame[i] as f64;
            weighted_sum += w * cents_mapping[i];
            weight_sum += w;
        }

        if weight_sum < 1e-8 {
            f0.push(0.0);
        } else {
            let avg_cents = weighted_sum / weight_sum;
            f0.push(10.0 * 2.0f64.powf(avg_cents / 1200.0));
        }
    }

    f0
}
