pub mod format;
pub mod mel;
pub mod model;
pub mod ops;
pub mod post;

use mel::MelExtractor;
use model::RmvpeModel;
use post::to_local_average_f0;

pub struct Rmvpe {
    model: RmvpeModel,
    mel_extractor: MelExtractor,
}

impl Rmvpe {
    pub fn load(model_path: &str) -> Result<Self, String> {
        let model = RmvpeModel::load(model_path)?;
        let mel_extractor = MelExtractor::new(160);
        Ok(Rmvpe { model, mel_extractor })
    }

    /// Extract F0 from audio samples (mono, any sample rate).
    /// Returns (f0_hz_per_frame, timestep_seconds).
    pub fn infer(&self, audio: &[f32], sample_rate: u32) -> (Vec<f64>, f64) {
        // Resample to 16kHz if needed
        let audio_16k = mel::resample_to_16k(audio, sample_rate);

        // Extract mel spectrogram: [128, T]
        let (mel, n_frames) = self.mel_extractor.extract(&audio_16k);

        // Pad T to multiple of 32
        let pad = (32 - n_frames % 32) % 32;
        let padded_t = n_frames + pad;
        let n_mels = 128;

        let padded_mel = if pad > 0 {
            let mut pm = vec![0.0f32; n_mels * padded_t];
            for m in 0..n_mels {
                pm[m * padded_t..m * padded_t + n_frames]
                    .copy_from_slice(&mel[m * n_frames..(m + 1) * n_frames]);
            }
            pm
        } else {
            mel
        };

        // Run model
        let output = self.model.forward(&padded_mel, n_mels, padded_t);

        // Trim to original frame count and decode
        let trimmed: Vec<f32> = output[..n_frames * 360].to_vec();
        let f0 = to_local_average_f0(&trimmed, n_frames, 0.03);

        let timestep = 160.0 / 16000.0; // hop_length / sample_rate
        (f0, timestep)
    }
}
