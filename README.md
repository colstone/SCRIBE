# SCRIBE

DiffSinger 数据标注工具 — 用于歌声合成变量参数数据集的制作与标注。

## 功能

- F0（基频）提取：Parselmouth / RMVPE / FCPE，全部 Rust 原生推理（INT8-mix 量化）
- MIDI 估算：SOME 模型，Rust 原生推理
- 音素时长标注与编辑
- 实时音频播放与波形显示
- 钢琴卷帘编辑器
- 导入/导出 DiffSinger 格式

## 构建

### 环境要求

- Node.js >= 18
- Rust >= 1.75
- [Tauri v2 CLI](https://v2.tauri.app/start/prerequisites/)

### 模型文件

构建前需将以下模型文件放入 `src-tauri/`：

| 文件 | 模型 | 用途 |
|------|------|------|
| `rmvpe.scr` | RMVPE (INT8-mix) | F0 提取 |
| `fcpe.scr` | FCPE (INT8-mix) | F0 提取 |
| `some.scr` | SOME (INT8-mix) | MIDI 估算 |

模型通过 Python 导出脚本从 PyTorch checkpoint 量化生成（脚本未包含在此仓库中）。

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

- **前端**：React + TypeScript + Vite
- **后端**：Rust + Tauri v2
- **音频**：cpal (跨平台音频 I/O)
- **推理引擎**：自研 INT8-mix 量化推理，AVX2 SIMD 加速

## License

MIT
