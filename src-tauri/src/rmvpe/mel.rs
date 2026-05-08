use rustfft::{FftPlanner, num_complex::Complex};
use std::f32::consts::PI;

const SAMPLE_RATE: usize = 16000;
const N_FFT: usize = 1024;
const WIN_LENGTH: usize = 1024;
const N_MELS: usize = 128;
const N_FREQ: usize = N_FFT / 2 + 1; // 513
const MEL_FMIN: f32 = 30.0;
const MEL_FMAX: f32 = 8000.0;
const CLAMP_MIN: f32 = 1e-5;

pub struct MelExtractor {
    hop_length: usize,
    mel_basis: Vec<f32>, // [N_MELS, N_FREQ] row-major
    hann_window: Vec<f32>,
}

impl MelExtractor {
    pub fn new(hop_length: usize) -> Self {
        let mel_basis = create_mel_filterbank(SAMPLE_RATE, N_FFT, N_MELS, MEL_FMIN, MEL_FMAX);
        let hann_window = hann(WIN_LENGTH);
        MelExtractor {
            hop_length,
            mel_basis,
            hann_window,
        }
    }

    /// Extract log mel spectrogram. Returns ([N_MELS * T] row-major, T).
    pub fn extract(&self, audio: &[f32]) -> (Vec<f32>, usize) {
        let pad = N_FFT / 2;
        let padded_len = audio.len() + 2 * pad;
        let mut padded = vec![0.0f32; padded_len];

        // Reflect padding
        for i in 0..pad {
            padded[pad - 1 - i] = audio[(i + 1).min(audio.len() - 1)];
        }
        padded[pad..pad + audio.len()].copy_from_slice(audio);
        for i in 0..pad {
            let src_idx = audio.len().saturating_sub(2 + i);
            padded[pad + audio.len() + i] = audio[src_idx];
        }

        let n_frames = (padded_len - N_FFT) / self.hop_length + 1;

        // FFT setup
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(N_FFT);

        // Compute magnitudes: [N_FREQ, n_frames] column-major for mel matmul efficiency
        let mut magnitudes = vec![0.0f32; N_FREQ * n_frames];
        let mut fft_buf = vec![Complex::new(0.0f32, 0.0); N_FFT];
        let mut scratch = vec![Complex::new(0.0f32, 0.0); fft.get_inplace_scratch_len()];

        for t in 0..n_frames {
            let start = t * self.hop_length;
            for i in 0..N_FFT {
                fft_buf[i] = Complex::new(padded[start + i] * self.hann_window[i], 0.0);
            }
            fft.process_with_scratch(&mut fft_buf, &mut scratch);

            for k in 0..N_FREQ {
                magnitudes[t * N_FREQ + k] = fft_buf[k].norm();
            }
        }

        // Mel matmul: [N_MELS, N_FREQ] x [N_FREQ, n_frames] -> [N_MELS, n_frames]
        // magnitudes is [n_frames, N_FREQ] row-major, so we do it transposed
        let mut mel_spec = vec![0.0f32; N_MELS * n_frames];
        for m in 0..N_MELS {
            let mel_row = &self.mel_basis[m * N_FREQ..(m + 1) * N_FREQ];
            for t in 0..n_frames {
                let mag_row = &magnitudes[t * N_FREQ..(t + 1) * N_FREQ];
                let mut sum = 0.0f32;
                for k in 0..N_FREQ {
                    sum += mel_row[k] * mag_row[k];
                }
                mel_spec[m * n_frames + t] = sum.max(CLAMP_MIN).ln();
            }
        }

        (mel_spec, n_frames)
    }
}

fn hann(n: usize) -> Vec<f32> {
    (0..n)
        .map(|i| 0.5 * (1.0 - (2.0 * PI * i as f32 / n as f32).cos()))
        .collect()
}

fn hz_to_mel(f: f32) -> f32 {
    2595.0 * (1.0 + f / 700.0).log10()
}

fn mel_to_hz(m: f32) -> f32 {
    700.0 * (10.0f32.powf(m / 2595.0) - 1.0)
}

fn create_mel_filterbank(sr: usize, n_fft: usize, n_mels: usize, fmin: f32, fmax: f32) -> Vec<f32> {
    let n_freq = n_fft / 2 + 1;
    let fmin_mel = hz_to_mel(fmin);
    let fmax_mel = hz_to_mel(fmax);

    let mut mel_points = vec![0.0f32; n_mels + 2];
    for i in 0..n_mels + 2 {
        mel_points[i] = fmin_mel + (fmax_mel - fmin_mel) * i as f32 / (n_mels + 1) as f32;
    }

    let hz_points: Vec<f32> = mel_points.iter().map(|&m| mel_to_hz(m)).collect();
    let bin_points: Vec<usize> = hz_points
        .iter()
        .map(|&f| ((n_fft + 1) as f32 * f / sr as f32).floor() as usize)
        .collect();

    let mut filterbank = vec![0.0f32; n_mels * n_freq];

    for i in 0..n_mels {
        let left = bin_points[i];
        let center = bin_points[i + 1];
        let right = bin_points[i + 2];

        for j in left..center {
            if center != left && j < n_freq {
                filterbank[i * n_freq + j] = (j - left) as f32 / (center - left) as f32;
            }
        }
        for j in center..right {
            if right != center && j < n_freq {
                filterbank[i * n_freq + j] = (right - j) as f32 / (right - center) as f32;
            }
        }

        // Slaney normalization
        let enorm = 2.0 / (hz_points[i + 2] - hz_points[i]);
        for j in 0..n_freq {
            filterbank[i * n_freq + j] *= enorm;
        }
    }

    filterbank
}

/// Resample audio from `src_sr` to 16kHz using linear interpolation.
pub fn resample_to_16k(audio: &[f32], src_sr: u32) -> Vec<f32> {
    if src_sr == SAMPLE_RATE as u32 {
        return audio.to_vec();
    }
    let ratio = SAMPLE_RATE as f64 / src_sr as f64;
    let out_len = (audio.len() as f64 * ratio).ceil() as usize;
    let mut output = Vec::with_capacity(out_len);
    let last = audio.len() - 1;
    for i in 0..out_len {
        let src_pos = i as f64 / ratio;
        let idx = src_pos as usize;
        let frac = (src_pos - idx as f64) as f32;
        let s0 = audio[idx.min(last)];
        let s1 = audio[(idx + 1).min(last)];
        output.push(s0 + (s1 - s0) * frac);
    }
    output
}
