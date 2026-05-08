use rayon::prelude::*;

const PAR_THRESHOLD: usize = 64;

// ======================== Conv1d INT8 (pointwise & k>1) ========================

/// Conv1d with INT8 weights. Input: [C_in, T], weight: [C_out, C_in, K] INT8.
/// Output: [C_out, T_out] where T_out = (T + 2*pad - K) / stride + 1.
pub fn conv1d_int8(
    input: &[f32], in_ch: usize, t_in: usize,
    weight: &[i8], scales: &[f32], bias: &[f32],
    out_ch: usize, kernel: usize, pad: usize, stride: usize,
) -> Vec<f32> {
    let t_out = (t_in + 2 * pad - kernel) / stride + 1;
    let k_len = in_ch * kernel;
    let mut output = vec![0.0f32; out_ch * t_out];

    let use_par = out_ch >= PAR_THRESHOLD;

    let compute_row = |oc: usize, out_row: &mut [f32]| {
        let w_row = &weight[oc * k_len..(oc + 1) * k_len];
        let scale = scales[oc];
        let b = bias[oc];
        for t in 0..t_out {
            let t_start = t * stride;
            let mut sum = 0.0f32;
            for ki in 0..kernel {
                let t_pos = t_start + ki;
                if t_pos < pad || t_pos >= t_in + pad { continue; }
                let t_real = t_pos - pad;
                for ic in 0..in_ch {
                    sum += w_row[ic * kernel + ki] as f32 * input[ic * t_in + t_real];
                }
            }
            out_row[t] = sum * scale + b;
        }
    };

    // For pointwise (k=1, pad=0, stride=1), use optimized GEMM path
    if kernel == 1 && pad == 0 && stride == 1 {
        gemv1d_int8(input, in_ch, t_in, weight, scales, bias, out_ch, &mut output, use_par);
    } else if use_par {
        output.par_chunks_mut(t_out).enumerate().for_each(|(oc, row)| {
            compute_row(oc, row);
        });
    } else {
        for oc in 0..out_ch {
            let row = &mut output[oc * t_out..(oc + 1) * t_out];
            compute_row(oc, row);
        }
    }

    output
}

/// Optimized GEMM for pointwise Conv1d: weight [out_ch, in_ch, 1] INT8, input [in_ch, T].
fn gemv1d_int8(
    input: &[f32], in_ch: usize, t: usize,
    weight: &[i8], scales: &[f32], bias: &[f32],
    out_ch: usize, output: &mut [f32], parallel: bool,
) {
    let compute = |oc: usize, out_row: &mut [f32]| {
        let w_row = &weight[oc * in_ch..(oc + 1) * in_ch];
        let scale = scales[oc];
        let b = bias[oc];

        #[cfg(target_arch = "x86_64")]
        {
            if is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") {
                unsafe { gemv1d_row_avx2(input, in_ch, t, w_row, scale, b, out_row); }
                return;
            }
        }

        for tt in 0..t {
            let mut sum = 0.0f32;
            for ic in 0..in_ch {
                sum += w_row[ic] as f32 * input[ic * t + tt];
            }
            out_row[tt] = sum * scale + b;
        }
    };

    if parallel {
        output.par_chunks_mut(t).enumerate().for_each(|(oc, row)| {
            compute(oc, row);
        });
    } else {
        for oc in 0..out_ch {
            compute(oc, &mut output[oc * t..(oc + 1) * t]);
        }
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
unsafe fn gemv1d_row_avx2(
    input: &[f32], in_ch: usize, t: usize,
    w_row: &[i8], scale: f32, bias: f32, out: &mut [f32],
) {
    use std::arch::x86_64::*;
    let scale_v = _mm256_set1_ps(scale);
    let bias_v = _mm256_set1_ps(bias);

    let mut tt = 0;
    while tt + 8 <= t {
        let mut acc = _mm256_setzero_ps();
        for ic in 0..in_ch {
            let x = _mm256_loadu_ps(input.as_ptr().add(ic * t + tt));
            let w = _mm256_set1_ps(w_row[ic] as f32);
            acc = _mm256_fmadd_ps(w, x, acc);
        }
        let result = _mm256_fmadd_ps(acc, scale_v, bias_v);
        _mm256_storeu_ps(out.as_mut_ptr().add(tt), result);
        tt += 8;
    }
    // tail
    for tt2 in tt..t {
        let mut sum = 0.0f32;
        for ic in 0..in_ch {
            sum += w_row[ic] as f32 * input[ic * t + tt2];
        }
        out[tt2] = sum * scale + bias;
    }
}

// ======================== Conv1d FP32 (for k=3 input convs if needed) ========================

pub fn conv1d_fp32(
    input: &[f32], in_ch: usize, t_in: usize,
    weight: &[f32], bias: &[f32],
    out_ch: usize, kernel: usize, pad: usize, stride: usize,
) -> Vec<f32> {
    let t_out = (t_in + 2 * pad - kernel) / stride + 1;
    let k_len = in_ch * kernel;
    let mut output = vec![0.0f32; out_ch * t_out];

    let compute_row = |oc: usize, out_row: &mut [f32]| {
        let w_row = &weight[oc * k_len..(oc + 1) * k_len];
        let b = bias[oc];
        for t in 0..t_out {
            let t_start = t * stride;
            let mut sum = 0.0f32;
            for ki in 0..kernel {
                let t_pos = t_start + ki;
                if t_pos < pad || t_pos >= t_in + pad { continue; }
                let t_real = t_pos - pad;
                for ic in 0..in_ch {
                    sum += w_row[ic * kernel + ki] * input[ic * t_in + t_real];
                }
            }
            out_row[t] = sum + b;
        }
    };

    if out_ch >= PAR_THRESHOLD {
        output.par_chunks_mut(t_out).enumerate().for_each(|(oc, row)| {
            compute_row(oc, row);
        });
    } else {
        for oc in 0..out_ch {
            compute_row(oc, &mut output[oc * t_out..(oc + 1) * t_out]);
        }
    }

    output
}

// ======================== Depthwise Conv1d FP32 ========================

/// Depthwise Conv1d: groups = channels. weight: [C, 1, K], input: [C, T].
pub fn depthwise_conv1d(
    input: &[f32], channels: usize, t_in: usize,
    weight: &[f32], bias: &[f32],
    kernel: usize, pad: usize,
) -> Vec<f32> {
    let t_out = t_in + 2 * pad - kernel + 1;
    let mut output = vec![0.0f32; channels * t_out];

    let compute = |ch: usize, out_row: &mut [f32]| {
        let w = &weight[ch * kernel..(ch + 1) * kernel];
        let b = bias[ch];
        let in_row = &input[ch * t_in..(ch + 1) * t_in];
        for t in 0..t_out {
            let mut sum = 0.0f32;
            for ki in 0..kernel {
                let t_pos = t + ki;
                if t_pos < pad || t_pos >= t_in + pad { continue; }
                sum += w[ki] * in_row[t_pos - pad];
            }
            out_row[t] = sum + b;
        }
    };

    if channels >= PAR_THRESHOLD {
        output.par_chunks_mut(t_out).enumerate().for_each(|(ch, row)| {
            compute(ch, row);
        });
    } else {
        for ch in 0..channels {
            compute(ch, &mut output[ch * t_out..(ch + 1) * t_out]);
        }
    }

    output
}

// ======================== LayerNorm ========================

/// LayerNorm over last dim. Input: [T, D] row-major.
pub fn layer_norm(x: &mut [f32], t: usize, d: usize, gamma: &[f32], beta: &[f32]) {
    let eps = 1e-5f32;
    for row in 0..t {
        let off = row * d;
        let slice = &mut x[off..off + d];
        let mean = slice.iter().sum::<f32>() / d as f32;
        let var = slice.iter().map(|v| (v - mean) * (v - mean)).sum::<f32>() / d as f32;
        let inv_std = 1.0 / (var + eps).sqrt();
        for i in 0..d {
            slice[i] = (slice[i] - mean) * inv_std * gamma[i] + beta[i];
        }
    }
}

// ======================== GroupNorm ========================

/// GroupNorm. Input: [C, T] channel-major. num_groups divides C.
pub fn group_norm(x: &mut [f32], channels: usize, t: usize, num_groups: usize, gamma: &[f32], beta: &[f32]) {
    let eps = 1e-5f32;
    let ch_per_group = channels / num_groups;

    for g in 0..num_groups {
        let ch_start = g * ch_per_group;
        let n = ch_per_group * t;

        let mut sum = 0.0f64;
        for c in ch_start..ch_start + ch_per_group {
            for i in 0..t {
                sum += x[c * t + i] as f64;
            }
        }
        let mean = (sum / n as f64) as f32;

        let mut var_sum = 0.0f64;
        for c in ch_start..ch_start + ch_per_group {
            for i in 0..t {
                let d = (x[c * t + i] - mean) as f64;
                var_sum += d * d;
            }
        }
        let var = (var_sum / n as f64) as f32;
        let inv_std = 1.0 / (var + eps).sqrt();

        for c in ch_start..ch_start + ch_per_group {
            let g = gamma[c];
            let b = beta[c];
            for i in 0..t {
                x[c * t + i] = (x[c * t + i] - mean) * inv_std * g + b;
            }
        }
    }
}

// ======================== Activations ========================

pub fn leaky_relu_inplace(x: &mut [f32]) {
    for v in x.iter_mut() {
        if *v < 0.0 { *v *= 0.01; }
    }
}

pub fn silu_inplace(x: &mut [f32]) {
    for v in x.iter_mut() {
        *v = *v * (1.0 / (1.0 + (-*v).exp()));
    }
}

pub fn sigmoid_inplace(x: &mut [f32]) {
    for v in x.iter_mut() {
        *v = 1.0 / (1.0 + (-*v).exp());
    }
}

/// GLU along channel dim. Input: [2*C, T], output: [C, T].
/// first_half * sigmoid(second_half)
pub fn glu(input: &[f32], half_ch: usize, t: usize) -> Vec<f32> {
    let mut output = vec![0.0f32; half_ch * t];
    for c in 0..half_ch {
        for i in 0..t {
            let a = input[c * t + i];
            let b = input[(half_ch + c) * t + i];
            output[c * t + i] = a * (1.0 / (1.0 + (-b).exp()));
        }
    }
    output
}

// ======================== Linear FP32 ========================

/// Linear: y = x @ W^T + b. x: [T, in_dim], W: [out_dim, in_dim], b: [out_dim].
/// Output: [T, out_dim].
pub fn linear_fp32(x: &[f32], t: usize, in_dim: usize, weight: &[f32], bias: &[f32], out_dim: usize) -> Vec<f32> {
    let mut output = vec![0.0f32; t * out_dim];

    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") {
            for row in 0..t {
                let x_row = &x[row * in_dim..(row + 1) * in_dim];
                let o_row = &mut output[row * out_dim..(row + 1) * out_dim];
                for oc in 0..out_dim {
                    let w_row = &weight[oc * in_dim..(oc + 1) * in_dim];
                    unsafe {
                        o_row[oc] = dot_avx2(x_row, w_row, in_dim) + bias[oc];
                    }
                }
            }
            return output;
        }
    }

    for row in 0..t {
        let x_row = &x[row * in_dim..(row + 1) * in_dim];
        for oc in 0..out_dim {
            let w_row = &weight[oc * in_dim..(oc + 1) * in_dim];
            let mut sum = 0.0f32;
            for i in 0..in_dim {
                sum += x_row[i] * w_row[i];
            }
            output[row * out_dim + oc] = sum + bias[oc];
        }
    }

    output
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
unsafe fn dot_avx2(a: &[f32], b: &[f32], n: usize) -> f32 {
    use std::arch::x86_64::*;
    let mut acc = _mm256_setzero_ps();
    let mut i = 0;
    while i + 8 <= n {
        let va = _mm256_loadu_ps(a.as_ptr().add(i));
        let vb = _mm256_loadu_ps(b.as_ptr().add(i));
        acc = _mm256_fmadd_ps(va, vb, acc);
        i += 8;
    }
    let mut buf = [0.0f32; 8];
    _mm256_storeu_ps(buf.as_mut_ptr(), acc);
    let mut sum: f32 = buf.iter().sum();
    for j in i..n {
        sum += a[j] * b[j];
    }
    sum
}

// ======================== Transpose helpers ========================

/// Transpose [C, T] -> [T, C]
pub fn transpose_ct_to_tc(input: &[f32], c: usize, t: usize) -> Vec<f32> {
    let mut out = vec![0.0f32; c * t];
    for ch in 0..c {
        for ti in 0..t {
            out[ti * c + ch] = input[ch * t + ti];
        }
    }
    out
}

/// Transpose [T, C] -> [C, T]
pub fn transpose_tc_to_ct(input: &[f32], t: usize, c: usize) -> Vec<f32> {
    let mut out = vec![0.0f32; c * t];
    for ti in 0..t {
        for ch in 0..c {
            out[ch * t + ti] = input[ti * c + ch];
        }
    }
    out
}

/// Residual add: x += y
pub fn add_inplace(x: &mut [f32], y: &[f32]) {
    debug_assert_eq!(x.len(), y.len());

    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") {
            unsafe { add_inplace_avx2(x, y); }
            return;
        }
    }

    for i in 0..x.len() {
        x[i] += y[i];
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
unsafe fn add_inplace_avx2(x: &mut [f32], y: &[f32]) {
    use std::arch::x86_64::*;
    let n = x.len();
    let mut i = 0;
    while i + 8 <= n {
        let va = _mm256_loadu_ps(x.as_ptr().add(i));
        let vb = _mm256_loadu_ps(y.as_ptr().add(i));
        _mm256_storeu_ps(x.as_mut_ptr().add(i), _mm256_add_ps(va, vb));
        i += 8;
    }
    for j in i..n {
        x[j] += y[j];
    }
}
