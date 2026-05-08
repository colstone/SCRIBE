use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, Stream, StreamConfig};
use hound::WavReader;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Serialize, Clone)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub api: String,
}

struct PlaybackData {
    samples: Vec<f32>,
    sample_rate: u32,
    channels: u16,
    duration: f64,
}

struct PlaybackAtomic {
    position: AtomicUsize,
    is_playing: AtomicBool,
    sample_rate: AtomicUsize,
    channels: AtomicUsize,
    frac_pos: AtomicU64,
}

pub struct AudioPlayer {
    data: Arc<Mutex<PlaybackData>>,
    atomic: Arc<PlaybackAtomic>,
    stream: Option<Stream>,
    hosts: Vec<Host>,
    device: Option<Device>,
    config: Option<StreamConfig>,
}

unsafe impl Send for AudioPlayer {}
unsafe impl Sync for AudioPlayer {}

impl AudioPlayer {
    pub fn new() -> Self {
        let mut hosts = Vec::new();
        hosts.push(cpal::default_host());
        #[cfg(all(target_os = "windows", feature = "asio"))]
        {
            if let Ok(asio_host) = cpal::host_from_id(cpal::HostId::Asio) {
                hosts.push(asio_host);
            }
        }
        Self {
            data: Arc::new(Mutex::new(PlaybackData {
                samples: vec![],
                sample_rate: 44100,
                channels: 1,
                duration: 0.0,
            })),
            atomic: Arc::new(PlaybackAtomic {
                position: AtomicUsize::new(0),
                is_playing: AtomicBool::new(false),
                sample_rate: AtomicUsize::new(44100),
                channels: AtomicUsize::new(1),
                frac_pos: AtomicU64::new(f64::to_bits(0.0)),
            }),
            stream: None,
            hosts,
            device: None,
            config: None,
        }
    }

    pub fn list_devices(&self) -> Vec<AudioDeviceInfo> {
        let mut devices = Vec::new();
        let mut seen_names = std::collections::HashSet::new();

        for host in &self.hosts {
            let api_name = format!("{:?}", host.id());
            let is_default_host = devices.is_empty();

            if is_default_host {
                if let Some(default) = host.default_output_device() {
                    let name = default.name().unwrap_or_else(|_| "Default".into());
                    seen_names.insert(format!("{}_{}", api_name, name));
                    devices.push(AudioDeviceInfo {
                        id: "default".to_string(),
                        name: format!("{} (默认)", name),
                        api: api_name.clone(),
                    });
                }
            }

            if let Ok(output_devices) = host.output_devices() {
                for dev in output_devices {
                    let name = dev.name().unwrap_or_else(|_| "Unknown".into());
                    let key = format!("{}_{}", api_name, name);
                    if seen_names.contains(&key) { continue; }
                    seen_names.insert(key);
                    let dev_id = format!("{}_{}", api_name.to_lowercase(), devices.len());
                    devices.push(AudioDeviceInfo {
                        id: dev_id,
                        name: format!("{} ({})", name, api_name),
                        api: api_name.clone(),
                    });
                }
            }
        }

        devices
    }

    pub fn load_wav(&mut self, wav_path: &str) -> Result<(f64, u32), String> {
        self.stop();

        let reader = WavReader::open(wav_path)
            .map_err(|e| format!("Failed to open WAV: {}", e))?;
        let spec = reader.spec();
        let sr = spec.sample_rate;
        let ch = spec.channels;
        let bits = spec.bits_per_sample;

        let raw: Vec<f32> = match spec.sample_format {
            hound::SampleFormat::Int => {
                let scale = (1i64 << (bits - 1)) as f32;
                reader.into_samples::<i32>()
                    .filter_map(|s| s.ok())
                    .map(|s| s as f32 / scale)
                    .collect()
            }
            hound::SampleFormat::Float => {
                reader.into_samples::<f32>()
                    .filter_map(|s| s.ok())
                    .collect()
            }
        };

        let duration = raw.len() as f64 / (sr as f64 * ch as f64);

        let mut d = self.data.lock().unwrap();
        d.samples = raw;
        d.sample_rate = sr;
        d.channels = ch;
        d.duration = duration;
        drop(d);

        self.atomic.position.store(0, Ordering::SeqCst);
        self.atomic.is_playing.store(false, Ordering::SeqCst);
        self.atomic.sample_rate.store(sr as usize, Ordering::SeqCst);
        self.atomic.channels.store(ch as usize, Ordering::SeqCst);

        Ok((duration, sr))
    }

    pub fn set_device(&mut self, device_id: &str) -> Result<(), String> {
        self.stop();

        let device = if device_id.is_empty() || device_id == "default" {
            self.hosts[0].default_output_device()
                .ok_or_else(|| "No default output device".to_string())?
        } else {
            let all = self.list_devices();
            let entry = all.iter().find(|d| d.id == device_id)
                .ok_or_else(|| "Device not found".to_string())?;
            let idx_in_list = all.iter().position(|d| d.id == device_id).unwrap();

            let mut found: Option<Device> = None;
            let mut count = 0;
            'outer: for host in &self.hosts {
                if let Some(def) = host.default_output_device() {
                    if count == idx_in_list {
                        found = Some(def);
                        break 'outer;
                    }
                    count += 1;
                }
                if let Ok(devs) = host.output_devices() {
                    for dev in devs {
                        if count == idx_in_list {
                            found = Some(dev);
                            break 'outer;
                        }
                        count += 1;
                    }
                }
            }
            let _ = entry;
            found.ok_or_else(|| "Device not found".to_string())?
        };

        let d = self.data.lock().unwrap();
        let config = StreamConfig {
            channels: d.channels,
            sample_rate: cpal::SampleRate(d.sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };
        drop(d);

        self.device = Some(device);
        self.config = Some(config);
        Ok(())
    }

    pub fn set_buffer_size(&mut self, size: u32) {
        if let Some(ref mut config) = self.config {
            config.buffer_size = if size == 0 {
                cpal::BufferSize::Default
            } else {
                cpal::BufferSize::Fixed(size)
            };
        }
    }

    pub fn play(&mut self, from_time: f64) -> Result<(), String> {
        self.stop();

        let device = if let Some(ref dev) = self.device {
            dev.clone()
        } else {
            self.hosts[0].default_output_device()
                .ok_or_else(|| "No default output device".to_string())?
        };

        let default_config = device.default_output_config()
            .map_err(|e| format!("Failed to get default output config: {}", e))?;

        let dev_sr = default_config.sample_rate().0;
        let dev_ch = default_config.channels();

        let d = self.data.lock().unwrap();
        let wav_sr = d.sample_rate;
        let wav_ch = d.channels;
        let samples = Arc::new(d.samples.clone());
        let start_pos = (from_time * wav_sr as f64 * wav_ch as f64) as usize;
        drop(d);

        self.atomic.position.store(start_pos, Ordering::SeqCst);
        self.atomic.is_playing.store(true, Ordering::SeqCst);

        let buf_size = if let Some(ref cfg) = self.config {
            cfg.buffer_size.clone()
        } else {
            cpal::BufferSize::Default
        };

        let config = StreamConfig {
            channels: dev_ch,
            sample_rate: cpal::SampleRate(dev_sr),
            buffer_size: buf_size,
        };

        let atomic = Arc::clone(&self.atomic);
        let samples_ref = Arc::clone(&samples);
        let wav_ch_usize = wav_ch as usize;
        let dev_ch_usize = dev_ch as usize;
        let total_wav_frames = samples_ref.len() / wav_ch_usize;
        let step = wav_sr as f64 / dev_sr as f64;

        self.atomic.frac_pos.store(f64::to_bits(from_time * wav_sr as f64), Ordering::SeqCst);

        let stream = device.build_output_stream(
            &config,
            move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                if !atomic.is_playing.load(Ordering::Relaxed) {
                    for sample in data.iter_mut() { *sample = 0.0; }
                    return;
                }

                let mut src_frame_f = f64::from_bits(atomic.frac_pos.load(Ordering::Relaxed));

                for frame in data.chunks_mut(dev_ch_usize) {
                    let src_frame = src_frame_f as usize;
                    if src_frame + 1 >= total_wav_frames {
                        for sample in frame.iter_mut() { *sample = 0.0; }
                        atomic.is_playing.store(false, Ordering::Relaxed);
                        continue;
                    }

                    let frac = (src_frame_f - src_frame as f64) as f32;
                    let base0 = src_frame * wav_ch_usize;
                    let base1 = (src_frame + 1) * wav_ch_usize;

                    for (ch_i, sample) in frame.iter_mut().enumerate() {
                        let src_ch = ch_i % wav_ch_usize;
                        let s0 = samples_ref[base0 + src_ch];
                        let s1 = samples_ref[base1 + src_ch];
                        *sample = s0 + (s1 - s0) * frac;
                    }

                    src_frame_f += step;
                }

                let wav_sample_pos = (src_frame_f as usize) * wav_ch_usize;
                atomic.position.store(wav_sample_pos, Ordering::Relaxed);
                atomic.frac_pos.store(f64::to_bits(src_frame_f), Ordering::Relaxed);
            },
            |_err| {},
            None,
        ).map_err(|e| format!("Failed to build stream: {}", e))?;

        stream.play().map_err(|e| format!("Failed to play stream: {}", e))?;
        self.stream = Some(stream);
        Ok(())
    }

    pub fn pause(&mut self) -> f64 {
        self.atomic.is_playing.store(false, Ordering::SeqCst);
        let sr = self.atomic.sample_rate.load(Ordering::Relaxed) as f64;
        let ch = self.atomic.channels.load(Ordering::Relaxed) as f64;
        let pos = self.atomic.position.load(Ordering::SeqCst);
        if sr > 0.0 && ch > 0.0 { pos as f64 / (sr * ch) } else { 0.0 }
    }

    pub fn stop(&mut self) {
        self.atomic.is_playing.store(false, Ordering::SeqCst);
        if let Some(stream) = self.stream.take() {
            drop(stream);
        }
        self.atomic.position.store(0, Ordering::SeqCst);
    }

    pub fn seek(&mut self, time: f64) {
        let sr = self.atomic.sample_rate.load(Ordering::Relaxed) as f64;
        let ch = self.atomic.channels.load(Ordering::Relaxed) as f64;
        let d = self.data.lock().unwrap();
        let max = d.samples.len();
        drop(d);
        let pos = (time * sr * ch) as usize;
        self.atomic.position.store(pos.min(max), Ordering::SeqCst);
        self.atomic.frac_pos.store(f64::to_bits(time * sr), Ordering::SeqCst);
    }

    pub fn get_position(&self) -> (f64, bool) {
        let sr = self.atomic.sample_rate.load(Ordering::Relaxed) as f64;
        let ch = self.atomic.channels.load(Ordering::Relaxed) as f64;
        let pos = self.atomic.position.load(Ordering::Relaxed);
        let playing = self.atomic.is_playing.load(Ordering::Relaxed);
        let time = if sr > 0.0 && ch > 0.0 { pos as f64 / (sr * ch) } else { 0.0 };
        (time, playing)
    }

    pub fn get_duration(&self) -> f64 {
        self.data.lock().unwrap().duration
    }
}
