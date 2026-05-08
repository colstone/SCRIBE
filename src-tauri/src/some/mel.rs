use rustfft::{FftPlanner, num_complex::Complex};
use std::f32::consts::PI;

pub struct MelExtractor {
    sample_rate: usize,
    hop_length: usize,
    win_length: usize,
    n_fft: usize,
    n_mels: usize,
    mel_basis: Vec<f32>,
    hann_window: Vec<f32>,
}

impl MelExtractor {
    pub fn new(sample_rate: usize, n_mels: usize, n_fft: usize, win_length: usize, hop_length: usize, fmin: f32, fmax: f32) -> Self {
        let mel_basis = create_mel_filterbank_htk(sample_rate, n_fft, n_mels, fmin, fmax);
        let hann_window = hann(win_length);
        MelExtractor { sample_rate, hop_length, win_length, n_fft, n_mels, mel_basis, hann_window }
    }

    /// Extract log mel spectrogram. Returns ([n_mels * T] channel-major, T).
    pub fn extract(&self, audio: &[f32]) -> (Vec<f32>, usize) {
        let n_freq = self.n_fft / 2 + 1;
        // SOME padding: pad_left = win_length // 2, pad_right = (win_length + 1) // 2
        let pad_left = self.win_length / 2;
        let pad_right = (self.win_length + 1) / 2;
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

        let n_frames = (padded_len - self.n_fft) / self.hop_length + 1;

        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(self.n_fft);
        let mut fft_buf = vec![Complex::new(0.0f32, 0.0); self.n_fft];
        let mut scratch = vec![Complex::new(0.0f32, 0.0); fft.get_inplace_scratch_len()];
        let mut magnitudes = vec![0.0f32; n_freq * n_frames];

        for t in 0..n_frames {
            let start = t * self.hop_length;
            for i in 0..self.n_fft {
                if i < self.win_length {
                    fft_buf[i] = Complex::new(padded[start + i] * self.hann_window[i], 0.0);
                } else {
                    fft_buf[i] = Complex::new(0.0, 0.0);
                }
            }
            fft.process_with_scratch(&mut fft_buf, &mut scratch);
            for k in 0..n_freq {
                let re = fft_buf[k].re;
                let im = fft_buf[k].im;
                magnitudes[t * n_freq + k] = (re * re + im * im).sqrt();
            }
        }

        // Mel matmul + log
        let mut mel_spec = vec![0.0f32; self.n_mels * n_frames];
        for m in 0..self.n_mels {
            let mel_row = &self.mel_basis[m * n_freq..(m + 1) * n_freq];
            for t in 0..n_frames {
                let mag_row = &magnitudes[t * n_freq..(t + 1) * n_freq];
                let mut sum = 0.0f32;
                for k in 0..n_freq { sum += mel_row[k] * mag_row[k]; }
                mel_spec[m * n_frames + t] = sum.max(1e-5).ln();
            }
        }

        (mel_spec, n_frames)
    }

    pub fn timestep(&self) -> f64 {
        self.hop_length as f64 / self.sample_rate as f64
    }
}

fn hann(n: usize) -> Vec<f32> {
    (0..n).map(|i| 0.5 * (1.0 - (2.0 * PI * i as f32 / n as f32).cos())).collect()
}

// HTK mel scale (used by SOME)
fn hz_to_mel_htk(f: f64) -> f64 { 2595.0 * (1.0 + f / 700.0).log10() }
fn mel_to_hz_htk(m: f64) -> f64 { 700.0 * (10.0f64.powf(m / 2595.0) - 1.0) }

fn create_mel_filterbank_htk(sr: usize, n_fft: usize, n_mels: usize, fmin: f32, fmax: f32) -> Vec<f32> {
    let n_freq = n_fft / 2 + 1;
    let fft_freqs: Vec<f64> = (0..n_freq).map(|i| i as f64 * sr as f64 / n_fft as f64).collect();

    let min_mel = hz_to_mel_htk(fmin as f64);
    let max_mel = hz_to_mel_htk(fmax as f64);
    let mel_f: Vec<f64> = (0..n_mels + 2)
        .map(|i| mel_to_hz_htk(min_mel + (max_mel - min_mel) * i as f64 / (n_mels + 1) as f64))
        .collect();

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
        for j in 0..n_freq { filterbank[i * n_freq + j] *= enorm as f32; }
    }
    filterbank
}
