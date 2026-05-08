# SCRIBE

DiffSinger 数据标注工具 — 用于歌声合成唱法参数数据集的制作与标注。

## 功能

- F0（基频）提取：Parselmouth / RMVPE / FCPE，基于神经网络的音高提取模型全部 Rust 原生推理（INT8-mix 量化），Parselmouth的音高提取部分使用Rust重写
- MIDI 估算：SOME 模型（INT8-mix 量化），Rust 原生推理
- 音素时长标注与编辑
- 实时音频播放与波形显示
- 更方便的词组划分功能
- 钢琴卷帘编辑器
- 导入/导出 DiffSinger 格式
- 更舒适的视觉设计（相对于SlurCutter而言），更加一致的设计风格，减缓标注时带来的疲劳感



目前代码存在的问题较多，功能尚未完善，还请发现bug后提出issue，以便第一时间进行修复，也欢迎各位共同开发。



## 构建

### 环境要求

- Node.js >= 18
- Rust >= 1.75
- [Tauri v2 CLI](https://v2.tauri.app/start/prerequisites/)

### 模型文件

构建前需将以下模型文件放入 `src-tauri/`：

| 文件          | 模型               | 用途      |
| ----------- | ---------------- | ------- |
| `rmvpe.scr` | RMVPE (INT8-mix) | F0 提取   |
| `fcpe.scr`  | FCPE (INT8-mix)  | F0 提取   |
| `some.scr`  | SOME (INT8-mix)  | MIDI 估算 |

### 开发

```bash
npm install
cargo tauri dev
```

### 构建发布版本

```bash
cargo tauri build
```

输出安装包在 `src-tauri/target/release/bundle/`。

## ASIO 支持（可选）

如需 ASIO 低延迟音频输出：

1. 下载 [Steinberg ASIO SDK](https://www.steinberg.net/asiosdk)
2. 解压到项目根目录 `asio_sdk/`
3. 构建时启用 feature：`cargo tauri build -- --features asio`

## 技术栈

### 前端

| 库 | 许可 | 用途 |
|---|---|---|
| [React](https://github.com/facebook/react) | MIT | UI 框架 |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | 状态管理 |
| [Vite](https://github.com/vitejs/vite) | MIT | 构建工具 |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 | 类型系统 |
| [@tauri-apps/api](https://github.com/tauri-apps/tauri) | MIT/Apache-2.0 | Tauri 前端绑定 |
| [@tauri-apps/plugin-dialog](https://github.com/tauri-apps/plugins-workspace) | MIT/Apache-2.0 | 原生对话框 |
| [@tauri-apps/plugin-fs](https://github.com/tauri-apps/plugins-workspace) | MIT/Apache-2.0 | 文件系统访问 |
| [@tauri-apps/plugin-shell](https://github.com/tauri-apps/plugins-workspace) | MIT/Apache-2.0 | Shell 命令 |

### 后端 (Rust)

| 库 | 许可 | 用途 |
|---|---|---|
| [Tauri](https://github.com/tauri-apps/tauri) | MIT/Apache-2.0 | 桌面应用框架 |
| [cpal](https://github.com/RustAudio/cpal) | Apache-2.0 | 跨平台音频 I/O |
| [hound](https://github.com/ruuda/hound) | Apache-2.0 | WAV 读写 |
| [rustfft](https://github.com/ejmahler/RustFFT) | MIT/Apache-2.0 | FFT 计算 |
| [rayon](https://github.com/rayon-rs/rayon) | MIT/Apache-2.0 | 数据并行 |
| [serde](https://github.com/serde-rs/serde) | MIT/Apache-2.0 | 序列化 |
| [serde_json](https://github.com/serde-rs/json) | MIT/Apache-2.0 | JSON 解析 |
| [tokio](https://github.com/tokio-rs/tokio) | MIT | 异步运行时 |

### 模型

| 模型 | 许可 | 用途 |
|---|---|---|
| [RMVPE](https://github.com/Dream-High/RMVPE) (Wei et al. 2023) | MIT | F0 提取 |
| [TorchFCPE](https://github.com/CNChTu/TorchFCPE) (CNChTu) | MIT | F0 提取 |
| [SOME](https://github.com/openvpi/SOME) (openvpi) | MIT | MIDI 估算 |

### 本项目原创实现

| 组件 | 说明 |
|---|---|
| Parselmouth-Rust | Praat F0 算法的 Rust 原生实现 |
| RMVPE / FCPE / SOME Rust 推理引擎 | INT8-mix 量化 + AVX2 SIMD 加速 |

## License

Apache-2.0
