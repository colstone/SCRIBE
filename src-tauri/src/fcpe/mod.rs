mod format;
mod ops;
mod model;
mod mel;

pub struct Fcpe {
    scr: format::ScrModel,
    mel_ext: mel::MelExtractor,
    cent_table: Vec<f32>,
}

impl Fcpe {
    pub fn load(path: &str) -> Result<Self, String> {
        let scr = format::ScrModel::load(path)
            .map_err(|e| format!("failed to load FCPE model: {}", e))?;

        let cent_table = scr.get_fp32("cent_table")
            .ok_or("missing cent_table in model")?
            .to_vec();

        let mel_ext = mel::MelExtractor::new();

        Ok(Fcpe { scr, mel_ext, cent_table })
    }

    /// Infer F0 from audio samples. Returns (f0_per_frame, timestep_seconds).
    pub fn infer(&self, audio: &[f32], sample_rate: u32) -> (Vec<f64>, f64) {
        let mono_16k = mel::resample_to_16k(audio, sample_rate);
        let (mel_spec, t) = self.mel_ext.extract(&mono_16k);
        let latent = model::forward(&self.scr, &mel_spec, 128, t);
        let f0 = model::latent_to_f0(&latent, t, &self.cent_table, 0.006);
        let timestep = 160.0 / 16000.0;
        (f0, timestep)
    }

    pub fn compute_mel(&self, audio_16k: &[f32]) -> (Vec<f32>, usize) {
        self.mel_ext.extract(audio_16k)
    }

    pub fn forward_from_mel(&self, mel: &[f32], n_mels: usize, t: usize) -> Vec<f32> {
        model::forward(&self.scr, mel, n_mels, t)
    }

    pub fn get_cent_table(&self) -> &[f32] {
        &self.cent_table
    }
}

pub fn decode_f0(latent: &[f32], t: usize, cent_table: &[f32], threshold: f32) -> Vec<f64> {
    model::latent_to_f0(latent, t, cent_table, threshold)
}
