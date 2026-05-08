use hound::WavReader;
use std::f64::consts::PI;

const MAX_CANDIDATES: usize = 15;

pub struct F0Params {
    pub hop_size: u32,
    pub f0_min: f64,
    pub f0_max: f64,
    pub voicing_threshold: f64,
    pub silence_threshold: f64,
    pub octave_cost: f64,
    pub octave_jump_cost: f64,
    pub voiced_unvoiced_cost: f64,
}

struct Candidate {
    freq: f64,
    strength: f64,
}

pub fn extract_f0(
    wav_path: &str,
    hop_size: u32,
    f0_min: f64,
    f0_max: f64,
) -> Result<(Vec<f64>, f64), String> {
    extract_f0_with_params(wav_path, &F0Params {
        hop_size, f0_min, f0_max,
        voicing_threshold: 0.25,
        silence_threshold: 0.01,
        octave_cost: 0.05,
        octave_jump_cost: 0.35,
        voiced_unvoiced_cost: 0.14,
    })
}

pub fn extract_f0_with_params(
    wav_path: &str,
    p: &F0Params,
) -> Result<(Vec<f64>, f64), String> {
    extract_f0_with_progress(wav_path, p, |_| {})
}

pub fn extract_f0_with_progress<F: FnMut(f64)>(
    wav_path: &str,
    p: &F0Params,
    mut on_progress: F,
) -> Result<(Vec<f64>, f64), String> {
    let (samples, sample_rate) = read_wav_mono(wav_path)?;
    if samples.is_empty() {
        return Ok((vec![], 0.0));
    }

    let timestep = p.hop_size as f64 / sample_rate;
    let n_samples = samples.len();

    let voicing_threshold = p.voicing_threshold;
    let silence_threshold = p.silence_threshold;
    let octave_cost = p.octave_cost;
    let octave_jump_cost = p.octave_jump_cost;
    let voiced_unvoiced_cost = p.voiced_unvoiced_cost;
    let f0_min = p.f0_min;
    let f0_max = p.f0_max;

    let periods_per_window = 3.0_f64;
    let window_dur = periods_per_window / f0_min;
    let win_len = (window_dur * sample_rate).ceil() as usize | 1; // ensure odd

    let half_win = win_len / 2;
    let hanning = make_hanning(win_len);
    let win_r0 = hanning_autocorr_at_zero(&hanning);

    let min_lag = (sample_rate / f0_max).floor() as usize;
    let max_lag = ((sample_rate / f0_min).ceil() as usize).min(win_len - 1);

    let n_frames = ((n_samples as f64) / p.hop_size as f64).ceil() as usize;
    if n_frames == 0 {
        return Ok((vec![], timestep));
    }

    let mut all_candidates: Vec<Vec<Candidate>> = Vec::with_capacity(n_frames);
    let mut last_reported: usize = 0;

    for fi in 0..n_frames {
        // Report progress every ~2%
        let pct = fi * 100 / n_frames;
        if pct >= last_reported + 2 {
            on_progress(pct as f64);
            last_reported = pct;
        }

        let center = fi * p.hop_size as usize;

        let mut frame = vec![0.0f64; win_len];
        for i in 0..win_len {
            let si = (center as isize) + (i as isize) - (half_win as isize);
            if si >= 0 && (si as usize) < n_samples {
                frame[i] = samples[si as usize] * hanning[i];
            }
        }

        let energy: f64 = frame.iter().map(|&x| x * x).sum();
        let rms = (energy / win_len as f64).sqrt();

        let mut candidates = Vec::with_capacity(MAX_CANDIDATES);
        candidates.push(Candidate {
            freq: 0.0,
            strength: voicing_threshold,
        });

        if rms < silence_threshold {
            all_candidates.push(candidates);
            continue;
        }

        let ac = autocorrelation(&frame, max_lag);

        let r0 = ac[0];
        if r0 < 1e-10 {
            all_candidates.push(candidates);
            continue;
        }

        let mut rac = vec![0.0f64; ac.len()];
        for tau in 0..ac.len() {
            let win_r = if tau < win_r0.len() { win_r0[tau] } else { 0.0 };
            if win_r > 1e-10 {
                rac[tau] = ac[tau] / win_r;
            }
        }

        let rac_norm: f64 = if rac[0] > 0.0 { rac[0] } else { 1.0 };

        let peaks = find_peaks(&rac, min_lag, max_lag);
        for (lag, _val) in peaks.iter().take(MAX_CANDIDATES - 1) {
            let norm_strength = rac[*lag] / rac_norm;
            if norm_strength > 0.0 {
                let freq = sample_rate / *lag as f64;
                let local_cost = octave_cost * (f0_min / freq).log2();
                candidates.push(Candidate {
                    freq,
                    strength: norm_strength - local_cost,
                });
            }
        }

        all_candidates.push(candidates);
    }

    on_progress(90.0);

    let f0 = viterbi(
        &all_candidates,
        octave_jump_cost,
        voiced_unvoiced_cost,
    );

    on_progress(100.0);

    Ok((f0, timestep))
}

fn read_wav_mono(wav_path: &str) -> Result<(Vec<f64>, f64), String> {
    let reader = WavReader::open(wav_path).map_err(|e| format!("Failed to open WAV: {}", e))?;
    let spec = reader.spec();
    let sr = spec.sample_rate as f64;
    let channels = spec.channels as usize;
    let bits = spec.bits_per_sample;

    let raw: Vec<f64> = match spec.sample_format {
        hound::SampleFormat::Int => {
            let scale = (1i64 << (bits - 1)) as f64;
            reader.into_samples::<i32>()
                .filter_map(|s| s.ok())
                .map(|s| s as f64 / scale)
                .collect()
        }
        hound::SampleFormat::Float => {
            reader.into_samples::<f32>()
                .filter_map(|s| s.ok())
                .map(|s| s as f64)
                .collect()
        }
    };

    if channels == 1 {
        return Ok((raw, sr));
    }

    let n = raw.len() / channels;
    let mut mono = vec![0.0f64; n];
    for i in 0..n {
        let mut sum = 0.0;
        for ch in 0..channels {
            sum += raw[i * channels + ch];
        }
        mono[i] = sum / channels as f64;
    }
    Ok((mono, sr))
}

fn make_hanning(n: usize) -> Vec<f64> {
    (0..n)
        .map(|i| 0.5 * (1.0 - (2.0 * PI * i as f64 / (n - 1) as f64).cos()))
        .collect()
}

fn hanning_autocorr_at_zero(window: &[f64]) -> Vec<f64> {
    let n = window.len();
    let mut result = vec![0.0f64; n];
    for tau in 0..n {
        let mut sum = 0.0;
        for i in 0..(n - tau) {
            sum += window[i] * window[i + tau];
        }
        result[tau] = sum;
    }
    result
}

fn autocorrelation(frame: &[f64], max_lag: usize) -> Vec<f64> {
    let n = frame.len();
    let lag_limit = max_lag.min(n - 1);
    let mut ac = vec![0.0f64; lag_limit + 1];
    for tau in 0..=lag_limit {
        let mut sum = 0.0;
        for i in 0..(n - tau) {
            sum += frame[i] * frame[i + tau];
        }
        ac[tau] = sum;
    }
    ac
}

fn find_peaks(data: &[f64], min_lag: usize, max_lag: usize) -> Vec<(usize, f64)> {
    let mut peaks = Vec::new();
    let end = max_lag.min(data.len() - 2);
    if min_lag + 1 > end {
        return peaks;
    }

    for i in (min_lag + 1)..=end {
        if data[i] > data[i - 1] && data[i] >= data[i + 1] && data[i] > 0.0 {
            let (refined_lag, refined_val) = parabolic_interp(data, i);
            let _ = refined_lag; // use integer lag for indexing
            peaks.push((i, refined_val));
        }
    }

    peaks.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    peaks
}

fn parabolic_interp(data: &[f64], idx: usize) -> (f64, f64) {
    if idx == 0 || idx >= data.len() - 1 {
        return (idx as f64, data[idx]);
    }
    let a = data[idx - 1];
    let b = data[idx];
    let c = data[idx + 1];
    let denom = 2.0 * (2.0 * b - a - c);
    if denom.abs() < 1e-12 {
        return (idx as f64, b);
    }
    let p = (a - c) / denom;
    (idx as f64 + p, b - 0.25 * (a - c) * p)
}

fn viterbi(
    frames: &[Vec<Candidate>],
    octave_jump_cost: f64,
    vu_cost: f64,
) -> Vec<f64> {
    let n = frames.len();
    if n == 0 {
        return vec![];
    }

    let mut delta: Vec<Vec<f64>> = Vec::with_capacity(n);
    let mut psi: Vec<Vec<usize>> = Vec::with_capacity(n);

    delta.push(frames[0].iter().map(|c| c.strength).collect());
    psi.push(vec![0; frames[0].len()]);

    for t in 1..n {
        let prev = &frames[t - 1];
        let curr = &frames[t];
        let pd = &delta[t - 1];

        let mut d = vec![f64::NEG_INFINITY; curr.len()];
        let mut p = vec![0usize; curr.len()];

        for (j, cj) in curr.iter().enumerate() {
            for (i, ci) in prev.iter().enumerate() {
                let tc = trans_cost(ci, cj, octave_jump_cost, vu_cost);
                let score = pd[i] + cj.strength - tc;
                if score > d[j] {
                    d[j] = score;
                    p[j] = i;
                }
            }
        }

        delta.push(d);
        psi.push(p);
    }

    let mut path = vec![0usize; n];
    let last = &delta[n - 1];
    let mut best = 0;
    let mut best_s = f64::NEG_INFINITY;
    for (j, &s) in last.iter().enumerate() {
        if s > best_s {
            best_s = s;
            best = j;
        }
    }
    path[n - 1] = best;

    for t in (0..n - 1).rev() {
        path[t] = psi[t + 1][path[t + 1]];
    }

    path.iter()
        .enumerate()
        .map(|(t, &j)| {
            if j < frames[t].len() {
                frames[t][j].freq
            } else {
                0.0
            }
        })
        .collect()
}

fn trans_cost(from: &Candidate, to: &Candidate, oct_cost: f64, vu_cost: f64) -> f64 {
    let fv = from.freq > 0.0;
    let tv = to.freq > 0.0;
    if fv && tv {
        oct_cost * (to.freq / from.freq).log2().abs()
    } else if fv != tv {
        vu_cost
    } else {
        0.0
    }
}
