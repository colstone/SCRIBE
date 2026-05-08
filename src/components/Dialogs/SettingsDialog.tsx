import React, { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore, type AppSettings } from '../../stores/settingsStore';

const FONT_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif';

type Tab = 'f0' | 'algorithm' | 'audio' | 'navigation' | 'ui';

const TAB_LABELS: Record<Tab, string> = {
  f0: 'F0 提取',
  algorithm: 'F0 算法',
  audio: '音频',
  navigation: '滚动与缩放',
  ui: '外观',
};

interface SettingsDialogProps {
  onClose: () => void;
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  } as React.CSSProperties,
  dialog: {
    backgroundColor: '#211F1E', borderRadius: '12px', border: '0.5px solid #2A2926',
    width: '480px', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
    fontFamily: FONT_SANS,
  } as React.CSSProperties,
  header: {
    padding: '20px 24px 0', fontSize: '16px', fontWeight: 500, color: '#E8E5DF',
    flexShrink: 0,
  } as React.CSSProperties,
  tabs: {
    display: 'flex', gap: '0', padding: '16px 24px 0', borderBottom: '0.5px solid #2A2926',
    flexShrink: 0,
  } as React.CSSProperties,
  tab: {
    padding: '6px 16px', fontSize: '11px', fontWeight: 400, cursor: 'pointer',
    color: '#A09D96', borderBottom: '2px solid transparent', transition: 'all 0.1s',
    background: 'none', border: 'none', fontFamily: FONT_SANS,
  } as React.CSSProperties,
  tabActive: {
    color: '#6DB0F2', borderBottom: '2px solid #6DB0F2',
  } as React.CSSProperties,
  body: {
    padding: '16px 24px 24px', overflowY: 'auto', flex: 1, minHeight: 0,
  } as React.CSSProperties,
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 0', gap: '12px',
  } as React.CSSProperties,
  label: {
    fontSize: '11px', color: '#A09D96', flexShrink: 0, minWidth: '120px',
  } as React.CSSProperties,
  numInput: {
    width: '80px', height: '28px', backgroundColor: '#2A2926', border: '0.5px solid #33312E',
    borderRadius: '4px', color: '#E8E5DF', fontSize: '11px', fontFamily: FONT_SANS,
    padding: '0 8px', outline: 'none', textAlign: 'right',
  } as React.CSSProperties,
  select: {
    height: '28px', backgroundColor: '#2A2926', border: '0.5px solid #33312E',
    borderRadius: '4px', color: '#E8E5DF', fontSize: '11px', fontFamily: FONT_SANS,
    padding: '0 8px', outline: 'none', cursor: 'pointer',
  } as React.CSSProperties,
  slider: {
    flex: 1, accentColor: '#6DB0F2', height: '4px',
  } as React.CSSProperties,
  sliderRow: {
    display: 'flex', alignItems: 'center', gap: '8px', flex: 1,
  } as React.CSSProperties,
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: '8px',
    padding: '0 24px 20px', borderTop: '0.5px solid #2A2926', paddingTop: '16px',
    flexShrink: 0,
  } as React.CSSProperties,
  btn: {
    padding: '6px 16px', borderRadius: '5px', fontSize: '12px', fontFamily: FONT_SANS, cursor: 'pointer',
  } as React.CSSProperties,
};

function NumField({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <div style={s.row}>
      <span style={s.label}>{label}</span>
      <input
        type="number"
        style={s.numInput as React.CSSProperties}
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
      />
    </div>
  );
}

function SliderField({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number;
}) {
  return (
    <div style={s.row}>
      <span style={s.label}>{label}</span>
      <div style={s.sliderRow}>
        <input
          type="range"
          style={s.slider}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <input
          type="number"
          style={{ ...s.numInput, width: '60px' } as React.CSSProperties}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
        />
      </div>
    </div>
  );
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ onClose }) => {
  const settings = useSettingsStore();
  const [tab, setTab] = useState<Tab>('f0');
  const [audioDevices, setAudioDevices] = useState<{ id: string; name: string; api: string }[]>([]);

  const upd = settings.update;

  useEffect(() => {
    if (tab === 'audio') {
      invoke<{ id: string; name: string; api: string }[]>('audio_list_devices')
        .then(setAudioDevices)
        .catch(() => setAudioDevices([]));
    }
  }, [tab]);

  const handleOverlay = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  return (
    <div style={s.overlay} onClick={handleOverlay}>
      <div style={s.dialog}>
        <div style={s.header}>设置</div>
        <div style={s.tabs}>
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div style={s.body as React.CSSProperties}>
          {tab === 'f0' && (
            <>
              <NumField label="Hop Size (采样点)" value={settings.f0HopSize} onChange={(v) => upd({ f0HopSize: v })} min={64} max={2048} step={1} />
              <NumField label="F0 最低频率 (Hz)" value={settings.f0Min} onChange={(v) => upd({ f0Min: v })} min={20} max={200} />
              <NumField label="F0 最高频率 (Hz)" value={settings.f0Max} onChange={(v) => upd({ f0Max: v })} min={500} max={5000} />
              <NumField label="采样率 (Hz)" value={settings.f0SampleRate} onChange={(v) => upd({ f0SampleRate: v })} min={8000} max={96000} />
              <div style={s.row}>
                <span style={s.label}>中值滤波</span>
                <select
                  style={s.select}
                  value={settings.f0MedianFilter ? 'true' : 'false'}
                  onChange={(e) => upd({ f0MedianFilter: e.target.value === 'true' })}
                >
                  <option value="true">启用</option>
                  <option value="false">禁用</option>
                </select>
              </div>
              {settings.f0MedianFilter && (
                <div style={s.row}>
                  <span style={s.label}>滤波窗口大小</span>
                  <select
                    style={s.select}
                    value={settings.f0MedianFilterSize}
                    onChange={(e) => upd({ f0MedianFilterSize: parseInt(e.target.value) })}
                  >
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                    <option value={7}>7</option>
                    <option value={9}>9</option>
                  </select>
                </div>
              )}
              <div style={s.row}>
                <span style={s.label}>F0 曲线平滑</span>
                <select
                  style={s.select}
                  value={settings.f0Smoothing}
                  onChange={(e) => upd({ f0Smoothing: e.target.value as AppSettings['f0Smoothing'] })}
                >
                  <option value="none">禁用</option>
                  <option value="linear">线性插值</option>
                  <option value="bezier">贝塞尔插值</option>
                  <option value="catmull-rom">Catmull-Rom 样条</option>
                  <option value="cubic">三次 B 样条</option>
                  <option value="quartic">四次 B 样条</option>
                </select>
              </div>
            </>
          )}

          {tab === 'algorithm' && (
            <>
              <div style={s.row}>
                <span style={s.label}>F0 算法</span>
                <select
                  style={s.select}
                  value={settings.f0Algorithm}
                  onChange={(e) => upd({ f0Algorithm: e.target.value as AppSettings['f0Algorithm'] })}
                >
                  <option value="parselmouth-rust">Parselmouth-Rust</option>
                  <option value="rmvpe">RMVPE</option>
                  <option value="fcpe">FCPE</option>
                </select>
              </div>
              <div style={{ fontSize: '10px', color: '#5F5D58', padding: '4px 0 12px' }}>
                Praat AC 算法参数（Parselmouth-Rust）
              </div>
              <SliderField label="Voicing 阈值" value={settings.voicingThreshold} onChange={(v) => upd({ voicingThreshold: v })} min={0} max={1} step={0.01} />
              <SliderField label="Silence 阈值" value={settings.silenceThreshold} onChange={(v) => upd({ silenceThreshold: v })} min={0} max={0.1} step={0.001} />
              <SliderField label="Octave Cost" value={settings.octaveCost} onChange={(v) => upd({ octaveCost: v })} min={0} max={0.5} step={0.01} />
              <SliderField label="Octave Jump Cost" value={settings.octaveJumpCost} onChange={(v) => upd({ octaveJumpCost: v })} min={0} max={1} step={0.01} />
              <SliderField label="V/UV Cost" value={settings.voicedUnvoicedCost} onChange={(v) => upd({ voicedUnvoicedCost: v })} min={0} max={1} step={0.01} />
              <div style={{ ...s.row, marginTop: '16px' }}>
                <span style={s.label}>MIDI 估算</span>
                <select
                  style={s.select}
                  value={settings.midiEstimator}
                  onChange={(e) => upd({ midiEstimator: e.target.value as AppSettings['midiEstimator'] })}
                >
                  <option value="simple">简单 (F0 投票)</option>
                  <option value="some">SOME (神经网络)</option>
                </select>
              </div>
            </>
          )}

          {tab === 'audio' && (
            <>
              <div style={s.row}>
                <span style={s.label}>音频输出设备</span>
                <select
                  style={{ ...s.select, flex: 1 }}
                  value={settings.audioDeviceId}
                  onChange={(e) => {
                    upd({ audioDeviceId: e.target.value });
                    invoke('audio_set_device', { deviceId: e.target.value, bufferSize: settings.audioBufferSize }).catch(() => {});
                  }}
                >
                  {audioDevices.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} [{d.api}]</option>
                  ))}
                </select>
              </div>
              <div style={s.row}>
                <span style={s.label}>缓冲区大小</span>
                <select
                  style={s.select}
                  value={settings.audioBufferSize}
                  onChange={(e) => {
                    const size = parseInt(e.target.value);
                    upd({ audioBufferSize: size });
                    invoke('audio_set_device', { deviceId: settings.audioDeviceId, bufferSize: size }).catch(() => {});
                  }}
                >
                  <option value={0}>自动</option>
                  <option value={128}>128</option>
                  <option value={256}>256</option>
                  <option value={512}>512</option>
                  <option value={1024}>1024</option>
                  <option value={2048}>2048</option>
                </select>
              </div>
              {settings.audioDeviceId.toLowerCase().includes('asio') && (
                <div style={s.row}>
                  <span style={s.label}>ASIO 设置</span>
                  <button
                    style={{ ...s.select, cursor: 'pointer', textAlign: 'center' }}
                    onClick={() => invoke('open_asio_panel').catch(() => {})}
                  >
                    打开系统音频设置
                  </button>
                </div>
              )}
              <div style={{ fontSize: '10px', color: '#5F5D58', padding: '8px 0' }}>
                使用 ASIO 设备可获得最低延迟（独占模式）。切换设备后需重新加载音频。
              </div>
            </>
          )}

          {tab === 'navigation' && (
            <>
              <div style={s.row}>
                <span style={s.label}>滚动与缩放模式</span>
                <select
                  style={s.select}
                  value={settings.navigationMode}
                  onChange={(e) => upd({ navigationMode: e.target.value as AppSettings['navigationMode'] })}
                >
                  <option value="mouse">鼠标</option>
                  <option value="trackpad">触控板</option>
                  <option value="touch">触屏</option>
                </select>
              </div>
              <div style={{ fontSize: '10px', color: '#5F5D58', padding: '8px 0', lineHeight: 1.8 }}>
                {settings.navigationMode === 'mouse' && (
                  <>
                    滚轮 = 垂直滚动（音高）<br/>
                    Shift + 滚轮 = 水平滚动（时间轴）<br/>
                    Ctrl + 滚轮 = 缩放<br/>
                    中键拖拽 = 平移
                  </>
                )}
                {settings.navigationMode === 'trackpad' && (
                  <>
                    双指滑动 = 平移（水平 + 垂直同时生效）<br/>
                    捏合 = 平滑缩放
                  </>
                )}
                {settings.navigationMode === 'touch' && (
                  <>
                    单指拖拽 = 平移<br/>
                    双指捏合 = 缩放<br/>
                    双击 = 自适应缩放
                  </>
                )}
              </div>
            </>
          )}

          {tab === 'ui' && (
            <>
              <div style={s.row}>
                <span style={s.label}>UI 缩放</span>
                <select
                  style={s.select}
                  value={settings.uiScale}
                  onChange={(e) => upd({ uiScale: parseFloat(e.target.value) })}
                >
                  <option value={0.75}>75%</option>
                  <option value={0.8}>80%</option>
                  <option value={0.9}>90%</option>
                  <option value={1.0}>100%</option>
                  <option value={1.1}>110%</option>
                  <option value={1.25}>125%</option>
                  <option value={1.5}>150%</option>
                </select>
              </div>
              <div style={s.row}>
                <span style={s.label}>语言</span>
                <select
                  style={s.select}
                  value={settings.language}
                  onChange={(e) => upd({ language: e.target.value as 'zh' | 'en' })}
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </div>
            </>
          )}
        </div>

        <div style={s.footer}>
          <button
            style={{ ...s.btn, backgroundColor: 'transparent', border: '0.5px solid #2A2926', color: '#A09D96' }}
            onClick={() => { settings.reset(); }}
          >
            恢复默认
          </button>
          <button
            style={{ ...s.btn, backgroundColor: '#6DB0F2', border: 'none', color: '#fff' }}
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;
