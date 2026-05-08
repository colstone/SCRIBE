pub mod format;
mod ops;
mod model;
mod mel;
pub mod post;

pub struct SomeNote {
    pub midi: f32,
    pub dur_seconds: f64,
    pub is_rest: bool,
}

pub struct SomeFrameResult {
    pub frame_midi: Vec<f32>,
    pub frame_bounds: Vec<f32>,
    pub frame_rest: Vec<bool>,
    pub timestep: f64,
}

pub struct Some {
    scr: format::ScrModel,
    mel_ext: mel::MelExtractor,
}

impl Some {
    pub fn load(path: &str) -> Result<Self, String> {
        let scr = format::ScrModel::load(path)
            .map_err(|e| format!("failed to load SOME model: {}", e))?;

        let cfg = &scr.config;
        let mel_ext = mel::MelExtractor::new(
            44100,
            cfg.units_dim as usize,
            cfg.win_size as usize,
            cfg.win_size as usize,
            cfg.hop_size as usize,
            cfg.mel_fmin,
            cfg.mel_fmax,
        );

        Ok(Some { scr, mel_ext })
    }

    /// Return frame-level MIDI values + boundary signal for frontend processing.
    pub fn infer_frames(&self, audio: &[f32], sample_rate: u32) -> SomeFrameResult {
        let audio_44k = resample(audio, sample_rate, 44100);
        let (mel_spec, t) = self.mel_ext.extract(&audio_44k);

        let (midi_probs, bounds) = model::forward(&self.scr, &mel_spec, self.scr.config.units_dim as usize, t);

        let cfg = &self.scr.config;
        let (midi_values, is_rest) = post::decode_gaussian_blurred_probs(
            &midi_probs, t, cfg.midi_num_bins as usize,
            0.0, cfg.midi_max as f32, cfg.midi_prob_deviation, cfg.rest_threshold,
        );

        SomeFrameResult {
            frame_midi: midi_values,
            frame_bounds: bounds,
            frame_rest: is_rest,
            timestep: self.mel_ext.timestep(),
        }
    }

    /// Infer aggregated note sequence (for CLI test).
    pub fn infer(&self, audio: &[f32], sample_rate: u32) -> Vec<SomeNote> {
        let fr = self.infer_frames(audio, sample_rate);
        let t = fr.frame_midi.len();

        let frame2note = post::decode_bounds_to_alignment(&fr.frame_bounds, t);
        let (note_midi, note_dur, note_rest) = post::decode_note_sequence(&frame2note, &fr.frame_midi, &fr.frame_rest, t);

        note_midi.iter().zip(note_dur.iter()).zip(note_rest.iter())
            .map(|((&midi, &dur), &rest)| SomeNote {
                midi,
                dur_seconds: dur as f64 * fr.timestep,
                is_rest: rest,
            })
            .collect()
    }

    pub fn config(&self) -> &format::SomeConfig {
        &self.scr.config
    }
}

fn resample(audio: &[f32], src_sr: u32, dst_sr: u32) -> Vec<f32> {
    if src_sr == dst_sr { return audio.to_vec(); }
    let ratio = dst_sr as f64 / src_sr as f64;
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
