mod f0;
mod audio;
pub mod rmvpe;
pub mod fcpe;
pub mod some;

use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::Emitter;
use tauri::Manager;
use std::sync::Mutex;
use tauri::State;

struct AudioState(Mutex<audio::AudioPlayer>);
struct RmvpeState(Mutex<Option<rmvpe::Rmvpe>>);
struct FcpeState(Mutex<Option<fcpe::Fcpe>>);
struct SomeState(Mutex<Option<some::Some>>);

#[tauri::command]
async fn extract_f0(
    app: tauri::AppHandle,
    wav_path: String,
    hop_size: u32,
    f0_min: f64,
    f0_max: f64,
    voicing_threshold: Option<f64>,
    silence_threshold: Option<f64>,
    octave_cost: Option<f64>,
    octave_jump_cost: Option<f64>,
    voiced_unvoiced_cost: Option<f64>,
) -> Result<serde_json::Value, String> {
    let params = f0::F0Params {
        hop_size,
        f0_min,
        f0_max,
        voicing_threshold: voicing_threshold.unwrap_or(0.25),
        silence_threshold: silence_threshold.unwrap_or(0.01),
        octave_cost: octave_cost.unwrap_or(0.05),
        octave_jump_cost: octave_jump_cost.unwrap_or(0.35),
        voiced_unvoiced_cost: voiced_unvoiced_cost.unwrap_or(0.14),
    };
    let (f0_data, timestep) =
        tokio::task::spawn_blocking(move || {
            f0::extract_f0_with_progress(&wav_path, &params, |pct| {
                let _ = app.emit("f0-progress", pct);
            })
        })
            .await
            .map_err(|e| format!("Task join error: {}", e))?
            .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "f0": f0_data, "timestep": timestep }))
}

#[tauri::command]
fn audio_list_devices(state: State<AudioState>) -> Result<Vec<audio::AudioDeviceInfo>, String> {
    let player = state.0.lock().map_err(|e| e.to_string())?;
    Ok(player.list_devices())
}

#[tauri::command]
fn audio_load(state: State<AudioState>, wav_path: String) -> Result<serde_json::Value, String> {
    let mut player = state.0.lock().map_err(|e| e.to_string())?;
    let (duration, sample_rate) = player.load_wav(&wav_path)?;
    Ok(serde_json::json!({ "duration": duration, "sampleRate": sample_rate }))
}

#[tauri::command]
fn audio_play(state: State<AudioState>, from_time: f64) -> Result<(), String> {
    let mut player = state.0.lock().map_err(|e| e.to_string())?;
    player.play(from_time)
}

#[tauri::command]
fn audio_pause(state: State<AudioState>) -> Result<serde_json::Value, String> {
    let mut player = state.0.lock().map_err(|e| e.to_string())?;
    let time = player.pause();
    Ok(serde_json::json!({ "currentTime": time }))
}

#[tauri::command]
fn audio_stop(state: State<AudioState>) -> Result<(), String> {
    let mut player = state.0.lock().map_err(|e| e.to_string())?;
    player.stop();
    Ok(())
}

#[tauri::command]
fn audio_seek(state: State<AudioState>, time: f64) -> Result<(), String> {
    let mut player = state.0.lock().map_err(|e| e.to_string())?;
    player.seek(time);
    Ok(())
}

#[tauri::command]
fn audio_set_device(state: State<AudioState>, device_id: String, buffer_size: u32) -> Result<(), String> {
    let mut player = state.0.lock().map_err(|e| e.to_string())?;
    player.set_device(&device_id)?;
    player.set_buffer_size(buffer_size);
    Ok(())
}

#[tauri::command]
fn audio_get_position(state: State<AudioState>) -> Result<serde_json::Value, String> {
    let player = state.0.lock().map_err(|e| e.to_string())?;
    let (time, is_playing) = player.get_position();
    Ok(serde_json::json!({ "time": time, "isPlaying": is_playing }))
}

#[tauri::command]
async fn extract_f0_rmvpe(
    app: tauri::AppHandle,
    rmvpe_state: State<'_, RmvpeState>,
    wav_path: String,
) -> Result<serde_json::Value, String> {
    // Lazy-load model on first call
    {
        let mut guard = rmvpe_state.0.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            let _ = app.emit("f0-progress", 0);
            let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
            let model_path = resource_dir.join("rmvpe.scr");
            let model_str = model_path.to_str().ok_or("invalid model path")?;
            *guard = Some(rmvpe::Rmvpe::load(model_str)?);
        }
    }

    let rmvpe_guard = rmvpe_state.0.lock().map_err(|e| e.to_string())?;
    let rmvpe_ref = rmvpe_guard.as_ref().unwrap();

    // Load audio
    let mut reader = hound::WavReader::open(&wav_path)
        .map_err(|e| format!("failed to open wav: {}", e))?;
    let spec = reader.spec();
    let sr = spec.sample_rate;
    let channels = spec.channels as usize;

    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            let bits = spec.bits_per_sample;
            let max_val = (1u32 << (bits - 1)) as f32;
            reader.samples::<i32>().map(|s| s.unwrap() as f32 / max_val).collect()
        }
        hound::SampleFormat::Float => {
            reader.samples::<f32>().map(|s| s.unwrap()).collect()
        }
    };

    let mono: Vec<f32> = if channels > 1 {
        samples.chunks(channels).map(|ch| ch.iter().sum::<f32>() / channels as f32).collect()
    } else {
        samples
    };

    // Clone what we need and drop the lock before spawn_blocking
    // Since Rmvpe doesn't implement Send easily, do inference in-place
    let _ = app.emit("f0-progress", 10);
    let (f0, timestep) = rmvpe_ref.infer(&mono, sr);
    let _ = app.emit("f0-progress", 100);

    let f0_f64: Vec<f64> = f0.into_iter().collect();
    Ok(serde_json::json!({ "f0": f0_f64, "timestep": timestep }))
}

#[tauri::command]
fn open_asio_panel() {
    #[cfg(target_os = "windows")]
    {
        std::thread::spawn(|| {
            let _ = std::process::Command::new("rundll32")
                .args(["shell32.dll,Control_RunDLL", "mmsys.cpl,,1"])
                .spawn();
        });
    }
}

#[tauri::command]
async fn extract_f0_fcpe(
    app: tauri::AppHandle,
    fcpe_state: State<'_, FcpeState>,
    wav_path: String,
) -> Result<serde_json::Value, String> {
    {
        let mut guard = fcpe_state.0.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            let _ = app.emit("f0-progress", 0);
            let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
            let model_path = resource_dir.join("fcpe.scr");
            let model_str = model_path.to_str().ok_or("invalid model path")?;
            *guard = Some(fcpe::Fcpe::load(model_str)?);
        }
    }

    let fcpe_guard = fcpe_state.0.lock().map_err(|e| e.to_string())?;
    let fcpe_ref = fcpe_guard.as_ref().unwrap();

    let mut reader = hound::WavReader::open(&wav_path)
        .map_err(|e| format!("failed to open wav: {}", e))?;
    let spec = reader.spec();
    let sr = spec.sample_rate;
    let channels = spec.channels as usize;

    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            let bits = spec.bits_per_sample;
            let max_val = (1u32 << (bits - 1)) as f32;
            reader.samples::<i32>().map(|s| s.unwrap() as f32 / max_val).collect()
        }
        hound::SampleFormat::Float => {
            reader.samples::<f32>().map(|s| s.unwrap()).collect()
        }
    };

    let mono: Vec<f32> = if channels > 1 {
        samples.chunks(channels).map(|ch| ch.iter().sum::<f32>() / channels as f32).collect()
    } else {
        samples
    };

    let _ = app.emit("f0-progress", 10);
    let (f0, timestep) = fcpe_ref.infer(&mono, sr);
    let _ = app.emit("f0-progress", 100);

    let f0_f64: Vec<f64> = f0.into_iter().collect();
    Ok(serde_json::json!({ "f0": f0_f64, "timestep": timestep }))
}

#[tauri::command]
async fn extract_midi_some(
    app: tauri::AppHandle,
    some_state: State<'_, SomeState>,
    wav_path: String,
) -> Result<serde_json::Value, String> {
    {
        let mut guard = some_state.0.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            let _ = app.emit("f0-progress", 0);
            let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
            let model_path = resource_dir.join("some.scr");
            let model_str = model_path.to_str().ok_or("invalid model path")?;
            *guard = Some(some::Some::load(model_str)?);
        }
    }

    let some_guard = some_state.0.lock().map_err(|e| e.to_string())?;
    let some_ref = some_guard.as_ref().unwrap();

    let mut reader = hound::WavReader::open(&wav_path)
        .map_err(|e| format!("failed to open wav: {}", e))?;
    let spec = reader.spec();
    let sr = spec.sample_rate;
    let channels = spec.channels as usize;

    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            let bits = spec.bits_per_sample;
            let max_val = (1u32 << (bits - 1)) as f32;
            reader.samples::<i32>().map(|s| s.unwrap() as f32 / max_val).collect()
        }
        hound::SampleFormat::Float => {
            reader.samples::<f32>().map(|s| s.unwrap()).collect()
        }
    };

    let mono: Vec<f32> = if channels > 1 {
        samples.chunks(channels).map(|ch| ch.iter().sum::<f32>() / channels as f32).collect()
    } else {
        samples
    };

    let _ = app.emit("f0-progress", 10);
    let result = some_ref.infer_frames(&mono, sr);
    let _ = app.emit("f0-progress", 100);

    Ok(serde_json::json!({
        "frameMidi": result.frame_midi,
        "frameBounds": result.frame_bounds,
        "frameRest": result.frame_rest,
        "timestep": result.timestep,
    }))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle();

            let import = MenuItemBuilder::with_id("menu-import", "导入数据集...")
                .accelerator("CmdOrCtrl+I")
                .build(app)?;
            let open = MenuItemBuilder::with_id("menu-open", "打开项目...")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let save = MenuItemBuilder::with_id("menu-save", "保存")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let export_csv = MenuItemBuilder::with_id("menu-export", "导出 CSV...")
                .accelerator("CmdOrCtrl+E")
                .build(app)?;
            let quit = PredefinedMenuItem::quit(app, Some("退出"))?;

            let file_menu = SubmenuBuilder::new(app, "文件")
                .item(&import)
                .item(&open)
                .item(&save)
                .item(&export_csv)
                .separator()
                .item(&quit)
                .build()?;

            let undo = MenuItemBuilder::with_id("menu-undo", "撤销")
                .accelerator("CmdOrCtrl+Z")
                .build(app)?;
            let redo = MenuItemBuilder::with_id("menu-redo", "重做")
                .accelerator("CmdOrCtrl+Shift+Z")
                .build(app)?;
            let select_all = MenuItemBuilder::with_id("menu-select-all", "全选")
                .accelerator("CmdOrCtrl+A")
                .build(app)?;
            let prev_segment = MenuItemBuilder::with_id("menu-prev-segment", "上一个条目")
                .accelerator("Shift+W")
                .build(app)?;
            let next_segment = MenuItemBuilder::with_id("menu-next-segment", "下一个条目")
                .accelerator("Shift+S")
                .build(app)?;

            let edit_menu = SubmenuBuilder::new(app, "编辑")
                .item(&undo)
                .item(&redo)
                .separator()
                .item(&select_all)
                .separator()
                .item(&prev_segment)
                .item(&next_segment)
                .build()?;

            let zoom_in = MenuItemBuilder::with_id("menu-zoom-in", "放大")
                .accelerator("CmdOrCtrl+=")
                .build(app)?;
            let zoom_out = MenuItemBuilder::with_id("menu-zoom-out", "缩小")
                .accelerator("CmdOrCtrl+-")
                .build(app)?;
            let zoom_fit = MenuItemBuilder::with_id("menu-zoom-fit", "适合窗口")
                .accelerator("CmdOrCtrl+0")
                .build(app)?;

            let view_menu = SubmenuBuilder::new(app, "视图")
                .item(&zoom_in)
                .item(&zoom_out)
                .item(&zoom_fit)
                .build()?;

            let phnum = MenuItemBuilder::with_id("menu-phnum", "生成词组划分...")
                .build(app)?;
            let rebuild_notes = MenuItemBuilder::with_id("menu-rebuild-notes", "重建音符")
                .build(app)?;
            let extract_all_f0 = MenuItemBuilder::with_id("menu-extract-all-f0", "提取所有 F0...")
                .build(app)?;

            let tools_menu = SubmenuBuilder::new(app, "工具")
                .item(&phnum)
                .item(&rebuild_notes)
                .item(&extract_all_f0)
                .separator()
                .item(&MenuItemBuilder::with_id("menu-settings", "设置...")
                    .accelerator("CmdOrCtrl+,")
                    .build(app)?)
                .build()?;

            let licenses = MenuItemBuilder::with_id("menu-licenses", "开源许可")
                .build(app)?;
            let about = MenuItemBuilder::with_id("menu-about", "关于 SCRIBE")
                .build(app)?;

            let help_menu = SubmenuBuilder::new(app, "帮助")
                .item(&licenses)
                .item(&about)
                .build()?;

            let menu = Menu::with_items(
                app,
                &[&file_menu, &edit_menu, &view_menu, &tools_menu, &help_menu],
            )?;

            app.set_menu(menu)?;

            let handle_clone = handle.clone();
            app.on_menu_event(move |_app, event| {
                let id = event.id().0.as_str();
                let _ = handle_clone.emit(id, ());
            });

            Ok(())
        })
        .manage(AudioState(Mutex::new(audio::AudioPlayer::new())))
        .manage(RmvpeState(Mutex::new(None)))
        .manage(FcpeState(Mutex::new(None)))
        .manage(SomeState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            extract_f0,
            extract_f0_rmvpe,
            extract_f0_fcpe,
            extract_midi_some,
            audio_list_devices,
            audio_load,
            audio_play,
            audio_pause,
            audio_stop,
            audio_seek,
            audio_set_device,
            audio_get_position,
            open_asio_panel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
