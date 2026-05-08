use std::collections::HashMap;
use std::io::{self, Read, Seek, SeekFrom};
use std::fs::File;
use std::path::Path;

const MAGIC: &[u8; 8] = b"SCRMVPE\0";

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Dtype {
    Int8 = 0,
    Fp16 = 1,
    Fp32 = 2,
}

#[derive(Debug)]
pub struct LayerInfo {
    pub name: String,
    pub dtype: Dtype,
    pub shape: Vec<u32>,
    pub scales: Option<Vec<f32>>,
    pub data_offset: u64,
    pub data_size: u64,
}

pub struct ScrModel {
    pub layers: Vec<LayerInfo>,
    pub data: Vec<u8>,
    pub act_scales: HashMap<String, f32>,
    index: HashMap<String, usize>,
}

impl ScrModel {
    pub fn load<P: AsRef<Path>>(path: P) -> io::Result<Self> {
        let mut f = File::open(path)?;

        let mut magic = [0u8; 8];
        f.read_exact(&mut magic)?;
        if &magic != MAGIC {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "invalid magic"));
        }

        let version = read_u32(&mut f)?;
        if version != 1 && version != 2 {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "unsupported version"));
        }

        let flags = read_u32(&mut f)?;
        let encrypted = flags & 1 != 0;
        if encrypted {
            return Err(io::Error::new(io::ErrorKind::Unsupported, "encrypted models not yet supported"));
        }

        let num_layers = read_u32(&mut f)? as usize;

        // v2: read activation scales
        let mut act_scales = HashMap::new();
        if version >= 2 {
            let num_act = read_u32(&mut f)? as usize;
            for _ in 0..num_act {
                let name_len = read_u16(&mut f)? as usize;
                let mut name_buf = vec![0u8; name_len];
                f.read_exact(&mut name_buf)?;
                let name = String::from_utf8(name_buf)
                    .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid utf8"))?;
                let scale = read_f32(&mut f)?;
                act_scales.insert(name, scale);
            }
        }

        let mut layers = Vec::with_capacity(num_layers);

        for _ in 0..num_layers {
            let name_len = read_u16(&mut f)? as usize;
            let mut name_buf = vec![0u8; name_len];
            f.read_exact(&mut name_buf)?;
            let name = String::from_utf8(name_buf)
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid utf8 name"))?;

            let dtype_byte = read_u8(&mut f)?;
            let dtype = match dtype_byte {
                0 => Dtype::Int8,
                1 => Dtype::Fp16,
                2 => Dtype::Fp32,
                _ => return Err(io::Error::new(io::ErrorKind::InvalidData, "unknown dtype")),
            };

            let ndim = read_u8(&mut f)? as usize;
            let mut shape = Vec::with_capacity(ndim);
            for _ in 0..ndim {
                shape.push(read_u32(&mut f)?);
            }

            let scales = if dtype == Dtype::Int8 {
                let num_ch = read_u32(&mut f)? as usize;
                let mut sc = vec![0f32; num_ch];
                let sc_bytes = unsafe {
                    std::slice::from_raw_parts_mut(sc.as_mut_ptr() as *mut u8, num_ch * 4)
                };
                f.read_exact(sc_bytes)?;
                Some(sc)
            } else {
                None
            };

            let data_offset = read_u64(&mut f)?;
            let data_size = read_u64(&mut f)?;

            layers.push(LayerInfo {
                name,
                dtype,
                shape,
                scales,
                data_offset,
                data_size,
            });
        }

        let mut data = Vec::new();
        f.read_to_end(&mut data)?;

        let mut index = HashMap::with_capacity(layers.len());
        for (i, layer) in layers.iter().enumerate() {
            index.insert(layer.name.clone(), i);
        }

        Ok(ScrModel { layers, data, act_scales, index })
    }

    pub fn get_layer(&self, name: &str) -> Option<&LayerInfo> {
        self.index.get(name).map(|&i| &self.layers[i])
    }

    pub fn get_int8_weight(&self, name: &str) -> Option<(&[i8], &[f32])> {
        let info = self.get_layer(name)?;
        if info.dtype != Dtype::Int8 {
            return None;
        }
        let start = info.data_offset as usize;
        let end = start + info.data_size as usize;
        let bytes = &self.data[start..end];
        let weight = unsafe { std::slice::from_raw_parts(bytes.as_ptr() as *const i8, bytes.len()) };
        let scales = info.scales.as_ref()?;
        Some((weight, scales))
    }

    pub fn get_fp16_as_f32(&self, name: &str) -> Option<Vec<f32>> {
        let info = self.get_layer(name)?;
        if info.dtype != Dtype::Fp16 {
            return None;
        }
        let start = info.data_offset as usize;
        let end = start + info.data_size as usize;
        let bytes = &self.data[start..end];
        let n = bytes.len() / 2;
        let mut out = Vec::with_capacity(n);
        for i in 0..n {
            let bits = u16::from_le_bytes([bytes[i * 2], bytes[i * 2 + 1]]);
            out.push(f16_to_f32(bits));
        }
        Some(out)
    }

    pub fn get_fp32(&self, name: &str) -> Option<&[f32]> {
        let info = self.get_layer(name)?;
        if info.dtype != Dtype::Fp32 {
            return None;
        }
        let start = info.data_offset as usize;
        let end = start + info.data_size as usize;
        let bytes = &self.data[start..end];
        let n = bytes.len() / 4;
        let ptr = bytes.as_ptr() as *const f32;
        Some(unsafe { std::slice::from_raw_parts(ptr, n) })
    }

    pub fn get_shape(&self, name: &str) -> Option<&[u32]> {
        self.get_layer(name).map(|l| l.shape.as_slice())
    }
}

fn read_u8(f: &mut File) -> io::Result<u8> {
    let mut buf = [0u8; 1];
    f.read_exact(&mut buf)?;
    Ok(buf[0])
}

fn read_u16(f: &mut File) -> io::Result<u16> {
    let mut buf = [0u8; 2];
    f.read_exact(&mut buf)?;
    Ok(u16::from_le_bytes(buf))
}

fn read_u32(f: &mut File) -> io::Result<u32> {
    let mut buf = [0u8; 4];
    f.read_exact(&mut buf)?;
    Ok(u32::from_le_bytes(buf))
}

fn read_f32(f: &mut File) -> io::Result<f32> {
    let mut buf = [0u8; 4];
    f.read_exact(&mut buf)?;
    Ok(f32::from_le_bytes(buf))
}

fn read_u64(f: &mut File) -> io::Result<u64> {
    let mut buf = [0u8; 8];
    f.read_exact(&mut buf)?;
    Ok(u64::from_le_bytes(buf))
}

pub fn f16_to_f32(bits: u16) -> f32 {
    let sign = ((bits >> 15) & 1) as u32;
    let exp = ((bits >> 10) & 0x1F) as u32;
    let frac = (bits & 0x3FF) as u32;

    if exp == 0 {
        if frac == 0 {
            return f32::from_bits(sign << 31);
        }
        // subnormal
        let mut e = 0i32;
        let mut f = frac;
        while (f & 0x400) == 0 {
            f <<= 1;
            e -= 1;
        }
        f &= 0x3FF;
        let exp32 = (127 - 15 + 1 + e) as u32;
        return f32::from_bits((sign << 31) | (exp32 << 23) | (f << 13));
    }
    if exp == 31 {
        if frac == 0 {
            return f32::from_bits((sign << 31) | (0xFF << 23));
        }
        return f32::from_bits((sign << 31) | (0xFF << 23) | (frac << 13));
    }

    let exp32 = exp + 127 - 15;
    f32::from_bits((sign << 31) | (exp32 << 23) | (frac << 13))
}
