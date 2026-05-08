use rustfft::{FftPlanner, num_complex::Complex};
use std::f32::consts::PI;

const SAMPLE_RATE: usize = 16000;
const N_FFT: usize = 1024;
const WIN_LENGTH: usize = 1024;
const HOP_LENGTH: usize = 160;
const N_MELS: usize = 128;
const N_FREQ: usize = N_FFT / 2 + 1;
const MEL_FMIN: f32 = 0.0;
const MEL_FMAX: f32 = 8000.0;
const CLAMP_MIN: f32 = 1e-5;

pub struct MelExtractor {
    mel_basis: Vec<f32>,
    hann_window: Vec<f32>,
}

impl MelExtractor {
    pub fn new() -> Self {
        MelExtractor {
            mel_basis: create_mel_filterbank(SAMPLE_RATE, N_FFT, N_MELS, MEL_FMIN, MEL_FMAX),
            hann_window: hann(WIN_LENGTH),
        }
    }

    /// Extract log mel spectrogram. Returns ([N_MELS * T] channel-major, T).
    pub fn extract(&self, audio: &[f32]) -> (Vec<f32>, usize) {
        // torchfcpe padding: pad_left = (win_size - hop_length) // 2 = 432
        let pad_left = (WIN_LENGTH - HOP_LENGTH) / 2;
        let pad_right = (WIN_LENGTH - HOP_LENGTH + 1) / 2;
        let padded_len = audio.len() + pad_left + pad_right;
        let mut padded = vec![0.0f32; padded_len];

        // Reflect padding
        for i in 0..pad_left {
            let src = (i + 1).min(audio.len() - 1);
            padded[pad_left - 1 - i] = audio[src];
        }
        padded[pad_left..pad_left + audio.len()].copy_from_slice(audio);
        for i in 0..pad_right {
            let src = audio.len().saturating_sub(2 + i);
            padded[pad_left + audio.len() + i] = audio[src];
        }

        let n_frames = (padded_len - N_FFT) / HOP_LENGTH + 1;

        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(N_FFT);

        let mut magnitudes = vec![0.0f32; N_FREQ * n_frames];
        let mut fft_buf = vec![Complex::new(0.0f32, 0.0); N_FFT];
        let mut scratch = vec![Complex::new(0.0f32, 0.0); fft.get_inplace_scratch_len()];

        for t in 0..n_frames {
            let start = t * HOP_LENGTH;
            for i in 0..N_FFT {
                fft_buf[i] = Complex::new(padded[start + i] * self.hann_window[i], 0.0);
            }
            fft.process_with_scratch(&mut fft_buf, &mut scratch);
            for k in 0..N_FREQ {
                let re = fft_buf[k].re;
                let im = fft_buf[k].im;
                magnitudes[t * N_FREQ + k] = (re * re + im * im + 1e-9).sqrt();
            }
        }

        // mel_spec: [N_MELS, n_frames] channel-major
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
    (0..n).map(|i| 0.5 * (1.0 - (2.0 * PI * i as f32 / n as f32).cos())).collect()
}

// Slaney mel scale (matches librosa default, NOT HTK)
fn hz_to_mel_slaney(f: f64) -> f64 {
    let f_sp = 200.0 / 3.0;
    let min_log_hz = 1000.0;
    let min_log_mel = (min_log_hz - 0.0) / f_sp;
    let logstep = (6.4f64).ln() / 27.0;
    if f >= min_log_hz {
        min_log_mel + (f / min_log_hz).ln() / logstep
    } else {
        (f - 0.0) / f_sp
    }
}

fn mel_to_hz_slaney(m: f64) -> f64 {
    let f_sp = 200.0 / 3.0;
    let min_log_hz = 1000.0;
    let min_log_mel = (min_log_hz - 0.0) / f_sp;
    let logstep = (6.4f64).ln() / 27.0;
    if m >= min_log_mel {
        min_log_hz * (logstep * (m - min_log_mel)).exp()
    } else {
        0.0 + f_sp * m
    }
}

fn create_mel_filterbank(sr: usize, n_fft: usize, n_mels: usize, fmin: f32, fmax: f32) -> Vec<f32> {
    let n_freq = n_fft / 2 + 1;

    // FFT bin center frequencies
    let fft_freqs: Vec<f64> = (0..n_freq)
        .map(|i| i as f64 * sr as f64 / n_fft as f64)
        .collect();

    // Mel-spaced center frequencies
    let min_mel = hz_to_mel_slaney(fmin as f64);
    let max_mel = hz_to_mel_slaney(fmax as f64);
    let mel_f: Vec<f64> = (0..n_mels + 2)
        .map(|i| mel_to_hz_slaney(min_mel + (max_mel - min_mel) * i as f64 / (n_mels + 1) as f64))
        .collect();

    // Build filterbank using librosa's exact method (ramps-based)
    let mut filterbank = vec![0.0f32; n_mels * n_freq];

    for i in 0..n_mels {
        let fdiff_lower = mel_f[i + 1] - mel_f[i];
        let fdiff_upper = mel_f[i + 2] - mel_f[i + 1];

        for j in 0..n_freq {
            let lower = (fft_freqs[j] - mel_f[i]) / fdiff_lower;
            let upper = (mel_f[i + 2] - fft_freqs[j]) / fdiff_upper;
            filterbank[i * n_freq + j] = lower.min(upper).max(0.0) as f32;
        }

        // Slaney normalization
        let enorm = 2.0 / (mel_f[i + 2] - mel_f[i]);
        for j in 0..n_freq {
            filterbank[i * n_freq + j] *= enorm as f32;
        }
    }

    filterbank
}

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
