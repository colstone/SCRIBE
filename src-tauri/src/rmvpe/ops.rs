/// Neural network operators for RMVPE inference.
/// Includes im2col + tiled GEMM with optional AVX2 acceleration.

use rayon::prelude::*;

// ======================== Conv2d via im2col + GEMM ========================

/// 2D convolution using im2col + GEMM.
/// If act_scale > 0, activations are quantized to INT8 for W8A8 GEMM.
/// Otherwise uses W8A-FP32 GEMM.
pub fn conv2d_int8(
    input: &[f32],
    in_ch: usize,
    in_h: usize,
    in_w: usize,
    weight: &[i8],
    scales: &[f32],
    bias: &[f32],
    out_ch: usize,
    kh: usize,
    kw: usize,
    pad_h: usize,
    pad_w: usize,
    stride_h: usize,
    stride_w: usize,
    relu: bool,
    act_scale: f32,
) -> Vec<f32> {
    let out_h = (in_h + 2 * pad_h - kh) / stride_h + 1;
    let out_w = (in_w + 2 * pad_w - kw) / stride_w + 1;
    let col_len = in_ch * kh * kw;
    let n_patches = out_h * out_w;

    // im2col: build [col_len, n_patches] column matrix
    let mut col = vec![0.0f32; col_len * n_patches];
    im2col(input, in_ch, in_h, in_w, kh, kw, pad_h, pad_w, stride_h, stride_w, &mut col);

    let mut output = vec![0.0f32; out_ch * n_patches];

    if act_scale > 0.0 {
        // W8A8: quantize col to INT8 and use integer GEMM
        let inv_scale = 1.0 / act_scale;
        let mut col_i8 = vec![0i8; col_len * n_patches];
        for i in 0..col.len() {
            let v = (col[i] * inv_scale).round();
            col_i8[i] = v.max(-128.0).min(127.0) as i8;
        }
        gemm_int8_int8(weight, scales, &col_i8, act_scale, &mut output, out_ch, col_len, n_patches, bias, relu);
    } else {
        gemm_int8_fp32(weight, scales, &col, &mut output, out_ch, col_len, n_patches, bias, relu);
    }

    output
}

/// 2D convolution with FP32 weights using im2col + GEMM.
pub fn conv2d_fp32(
    input: &[f32],
    in_ch: usize,
    in_h: usize,
    in_w: usize,
    weight: &[f32],
    bias: &[f32],
    out_ch: usize,
    kh: usize,
    kw: usize,
    pad_h: usize,
    pad_w: usize,
    stride_h: usize,
    stride_w: usize,
    relu: bool,
) -> Vec<f32> {
    let out_h = (in_h + 2 * pad_h - kh) / stride_h + 1;
    let out_w = (in_w + 2 * pad_w - kw) / stride_w + 1;
    let col_len = in_ch * kh * kw;
    let n_patches = out_h * out_w;

    let mut col = vec![0.0f32; col_len * n_patches];
    im2col(input, in_ch, in_h, in_w, kh, kw, pad_h, pad_w, stride_h, stride_w, &mut col);

    let mut output = vec![0.0f32; out_ch * n_patches];
    gemm_fp32(weight, &col, &mut output, out_ch, col_len, n_patches, bias, relu);

    output
}

/// Transposed 2D convolution.
/// weight: [in_ch, out_ch, kH, kW] INT8, quantized on dim=1 (out_ch)
pub fn conv_transpose2d_int8(
    input: &[f32],
    in_ch: usize,
    in_h: usize,
    in_w: usize,
    weight: &[i8],
    scales: &[f32],
    bias: &[f32],
    out_ch: usize,
    kh: usize,
    kw: usize,
    pad_h: usize,
    pad_w: usize,
    stride_h: usize,
    stride_w: usize,
    out_pad_h: usize,
    out_pad_w: usize,
    relu: bool,
) -> Vec<f32> {
    let out_h = (in_h - 1) * stride_h + kh - 2 * pad_h + out_pad_h;
    let out_w = (in_w - 1) * stride_w + kw - 2 * pad_w + out_pad_w;
    let out_hw = out_h * out_w;
    let mut output = vec![0.0f32; out_ch * out_hw];

    // Parallel over output channels
    output.par_chunks_mut(out_hw).enumerate().for_each(|(oc, out_slice)| {
        // Init with bias
        for v in out_slice.iter_mut() {
            *v = bias[oc];
        }
        // Accumulate from all input channels
        for ic in 0..in_ch {
            for ih in 0..in_h {
                for iw in 0..in_w {
                    let in_val = input[ic * in_h * in_w + ih * in_w + iw];
                    if in_val == 0.0 { continue; }
                    for khi in 0..kh {
                        let oh_raw = ih * stride_h + khi;
                        if oh_raw < pad_h { continue; }
                        let oh = oh_raw - pad_h;
                        if oh >= out_h { continue; }
                        for kwi in 0..kw {
                            let ow_raw = iw * stride_w + kwi;
                            if ow_raw < pad_w { continue; }
                            let ow = ow_raw - pad_w;
                            if ow >= out_w { continue; }
                            let w_idx = ic * (out_ch * kh * kw) + oc * (kh * kw) + khi * kw + kwi;
                            out_slice[oh * out_w + ow] +=
                                in_val * weight[w_idx] as f32 * scales[oc];
                        }
                    }
                }
            }
        }
        if relu {
            for v in out_slice.iter_mut() {
                if *v < 0.0 { *v = 0.0; }
            }
        }
    });

    output
}

// ======================== im2col ========================

fn im2col(
    input: &[f32],
    in_ch: usize,
    in_h: usize,
    in_w: usize,
    kh: usize,
    kw: usize,
    pad_h: usize,
    pad_w: usize,
    stride_h: usize,
    stride_w: usize,
    col: &mut [f32],
) {
    let out_h = (in_h + 2 * pad_h - kh) / stride_h + 1;
    let out_w = (in_w + 2 * pad_w - kw) / stride_w + 1;
    let n_patches = out_h * out_w;

    let mut col_idx = 0;
    for ic in 0..in_ch {
        let in_base = ic * in_h * in_w;
        for khi in 0..kh {
            for kwi in 0..kw {
                for oh in 0..out_h {
                    let ih = oh * stride_h + khi;
                    let ih_s = ih as isize - pad_h as isize;
                    for ow in 0..out_w {
                        let iw = ow * stride_w + kwi;
                        let iw_s = iw as isize - pad_w as isize;
                        col[col_idx] = if ih_s >= 0 && ih_s < in_h as isize && iw_s >= 0 && iw_s < in_w as isize {
                            input[in_base + ih_s as usize * in_w + iw_s as usize]
                        } else {
                            0.0
                        };
                        col_idx += 1;
                    }
                }
            }
        }
    }
}

// ======================== GEMM kernels ========================

/// W8A8 GEMM: A[M,K] i8 x col[K,N] i8 -> out[M,N] f32
/// out[m,n] = sum_k(A[m,k] * col[k,n]) * (w_scale[m] * act_scale) + bias[m]
fn gemm_int8_int8(
    a: &[i8],
    w_scales: &[f32],
    col: &[i8],
    act_scale: f32,
    out: &mut [f32],
    m: usize,
    k: usize,
    n: usize,
    bias: &[f32],
    relu: bool,
) {
    let do_parallel = m >= PAR_THRESHOLD && n * k > 4096;
    if do_parallel {
        out.par_chunks_mut(n).enumerate().for_each(|(mi, out_row)| {
            let a_row = &a[mi * k..(mi + 1) * k];
            let dequant = w_scales[mi] * act_scale;
            for ni in 0..n {
                let mut acc = 0i32;
                for ki in 0..k {
                    acc += a_row[ki] as i32 * col[ki * n + ni] as i32;
                }
                let val = acc as f32 * dequant + bias[mi];
                out_row[ni] = if relu && val < 0.0 { 0.0 } else { val };
            }
        });
    } else {
        for mi in 0..m {
            let a_row = &a[mi * k..(mi + 1) * k];
            let dequant = w_scales[mi] * act_scale;
            let out_row = &mut out[mi * n..(mi + 1) * n];
            for ni in 0..n {
                let mut acc = 0i32;
                for ki in 0..k {
                    acc += a_row[ki] as i32 * col[ki * n + ni] as i32;
                }
                let val = acc as f32 * dequant + bias[mi];
                out_row[ni] = if relu && val < 0.0 { 0.0 } else { val };
            }
        }
    }
}

const PAR_THRESHOLD: usize = 32; // only parallelize M >= this

/// INT8 weight x FP32 activation GEMM.
/// A: [M, K] i8 (weight), col: [K, N] f32, out: [M, N] f32
/// out[m,n] = sum_k(A[m,k] * scale[m] * col[k,n]) + bias[m]
fn gemm_int8_fp32(
    a: &[i8],
    scales: &[f32],
    col: &[f32],
    out: &mut [f32],
    m: usize,
    k: usize,
    n: usize,
    bias: &[f32],
    relu: bool,
) {
    #[cfg(target_arch = "x86_64")]
    let use_avx2 = is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma");
    #[cfg(not(target_arch = "x86_64"))]
    let use_avx2 = false;

    let do_parallel = m >= PAR_THRESHOLD && n * k > 4096;

    if do_parallel {
        out.par_chunks_mut(n).enumerate().for_each(|(mi, out_row)| {
            let a_row = &a[mi * k..(mi + 1) * k];
            #[cfg(target_arch = "x86_64")]
            if use_avx2 {
                unsafe { gemm_row_avx2_int8(a_row, scales[mi], col, out_row, k, n, bias[mi], relu); }
                return;
            }
            gemm_row_scalar_int8(a_row, scales[mi], col, out_row, k, n, bias[mi], relu);
        });
    } else {
        for mi in 0..m {
            let out_row = &mut out[mi * n..(mi + 1) * n];
            let a_row = &a[mi * k..(mi + 1) * k];
            #[cfg(target_arch = "x86_64")]
            if use_avx2 {
                unsafe { gemm_row_avx2_int8(a_row, scales[mi], col, out_row, k, n, bias[mi], relu); }
                continue;
            }
            gemm_row_scalar_int8(a_row, scales[mi], col, out_row, k, n, bias[mi], relu);
        }
    }
}

fn gemm_row_scalar_int8(
    a_row: &[i8],
    scale: f32,
    col: &[f32],
    out_row: &mut [f32],
    k: usize,
    n: usize,
    bias: f32,
    relu: bool,
) {
    // Init with bias
    for ni in 0..n {
        out_row[ni] = bias;
    }
    // Accumulate: scatter pattern (better for small N)
    for ki in 0..k {
        let a_val = a_row[ki] as f32 * scale;
        let col_row = &col[ki * n..ki * n + n];
        for ni in 0..n {
            out_row[ni] += a_val * col_row[ni];
        }
    }
    if relu {
        for v in out_row.iter_mut() {
            if *v < 0.0 { *v = 0.0; }
        }
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
unsafe fn gemm_row_avx2_int8(
    a_row: &[i8],
    scale: f32,
    col: &[f32],
    out_row: &mut [f32],
    k: usize,
    n: usize,
    bias: f32,
    relu: bool,
) {
    use std::arch::x86_64::*;
    let zero = _mm256_setzero_ps();
    let n8 = n / 8 * 8;

    if n >= 8 {
        // For larger N: gather pattern (iterate K in inner loop per 8 output cols)
        let scale_v = _mm256_set1_ps(scale);
        let bias_v = _mm256_set1_ps(bias);
        for ni in (0..n8).step_by(8) {
            let mut acc = _mm256_setzero_ps();
            for ki in 0..k {
                let a_val = _mm256_set1_ps(a_row[ki] as f32);
                let col_v = _mm256_loadu_ps(col.as_ptr().add(ki * n + ni));
                acc = _mm256_fmadd_ps(a_val, col_v, acc);
            }
            acc = _mm256_fmadd_ps(acc, scale_v, bias_v);
            if relu { acc = _mm256_max_ps(acc, zero); }
            _mm256_storeu_ps(out_row.as_mut_ptr().add(ni), acc);
        }
    } else {
        // For small N (< 8): scatter pattern with scalar, pre-scaled
        for ni in 0..n.min(n8) {
            out_row[ni] = bias;
        }
    }

    // Handle N < 8 or remainder with scatter pattern
    if n < 8 {
        for ni in 0..n { out_row[ni] = bias; }
        for ki in 0..k {
            let a_val = a_row[ki] as f32 * scale;
            let col_base = ki * n;
            for ni in 0..n {
                out_row[ni] += a_val * col[col_base + ni];
            }
        }
        if relu {
            for v in out_row.iter_mut() { if *v < 0.0 { *v = 0.0; } }
        }
    } else {
        // Remainder columns after n8
        for ni in n8..n {
            let mut sum = 0.0f32;
            for ki in 0..k {
                sum += a_row[ki] as f32 * col[ki * n + ni];
            }
            let val = sum * scale + bias;
            out_row[ni] = if relu && val < 0.0 { 0.0 } else { val };
        }
    }
}

/// FP32 GEMM with optional AVX2/FMA
fn gemm_fp32(
    a: &[f32],
    col: &[f32],
    out: &mut [f32],
    m: usize,
    k: usize,
    n: usize,
    bias: &[f32],
    relu: bool,
) {
    #[cfg(target_arch = "x86_64")]
    let use_avx2 = is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma");
    #[cfg(not(target_arch = "x86_64"))]
    let use_avx2 = false;

    if m >= PAR_THRESHOLD && n * k > 4096 {
        out.par_chunks_mut(n).enumerate().for_each(|(mi, out_row)| {
            let a_row = &a[mi * k..(mi + 1) * k];
            let b_val = bias[mi];
            #[cfg(target_arch = "x86_64")]
            if use_avx2 {
                unsafe { gemm_row_avx2_fp32(a_row, col, out_row, k, n, b_val, relu); }
                return;
            }
            gemm_row_scalar_fp32(a_row, col, out_row, k, n, b_val, relu);
        });
    } else {
        for mi in 0..m {
            let out_row = &mut out[mi * n..(mi + 1) * n];
            let a_row = &a[mi * k..(mi + 1) * k];
            #[cfg(target_arch = "x86_64")]
            if use_avx2 {
                unsafe { gemm_row_avx2_fp32(a_row, col, out_row, k, n, bias[mi], relu); }
                continue;
            }
            gemm_row_scalar_fp32(a_row, col, out_row, k, n, bias[mi], relu);
        }
    }
}

fn gemm_row_scalar_fp32(
    a_row: &[f32],
    col: &[f32],
    out_row: &mut [f32],
    k: usize,
    n: usize,
    bias: f32,
    relu: bool,
) {
    for ni in 0..n {
        let mut sum = 0.0f32;
        for ki in 0..k {
            sum += a_row[ki] * col[ki * n + ni];
        }
        let val = sum + bias;
        out_row[ni] = if relu && val < 0.0 { 0.0 } else { val };
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
unsafe fn gemm_row_avx2_fp32(
    a_row: &[f32],
    col: &[f32],
    out_row: &mut [f32],
    k: usize,
    n: usize,
    bias: f32,
    relu: bool,
) {
    use std::arch::x86_64::*;
    let bias_v = _mm256_set1_ps(bias);
    let zero = _mm256_setzero_ps();
    let n8 = n / 8 * 8;

    for ni in (0..n8).step_by(8) {
        let mut acc = _mm256_setzero_ps();
        for ki in 0..k {
            let a_val = _mm256_set1_ps(a_row[ki]);
            let col_v = _mm256_loadu_ps(col.as_ptr().add(ki * n + ni));
            acc = _mm256_fmadd_ps(a_val, col_v, acc);
        }
        acc = _mm256_add_ps(acc, bias_v);
        if relu {
            acc = _mm256_max_ps(acc, zero);
        }
        _mm256_storeu_ps(out_row.as_mut_ptr().add(ni), acc);
    }
    for ni in n8..n {
        let mut sum = 0.0f32;
        for ki in 0..k {
            sum += a_row[ki] * col[ki * n + ni];
        }
        let val = sum + bias;
        out_row[ni] = if relu && val < 0.0 { 0.0 } else { val };
    }
}

// ======================== Utility ops ========================

pub fn avg_pool2d_2x2(input: &[f32], ch: usize, h: usize, w: usize) -> Vec<f32> {
    let out_h = h / 2;
    let out_w = w / 2;
    let mut output = vec![0.0f32; ch * out_h * out_w];

    for c in 0..ch {
        let in_base = c * h * w;
        let out_base = c * out_h * out_w;
        for oh in 0..out_h {
            let ih = oh * 2;
            for ow in 0..out_w {
                let iw = ow * 2;
                let sum = input[in_base + ih * w + iw]
                    + input[in_base + ih * w + iw + 1]
                    + input[in_base + (ih + 1) * w + iw]
                    + input[in_base + (ih + 1) * w + iw + 1];
                output[out_base + oh * out_w + ow] = sum * 0.25;
            }
        }
    }
    output
}

pub fn relu_inplace(data: &mut [f32]) {
    for v in data.iter_mut() {
        if *v < 0.0 { *v = 0.0; }
    }
}

pub fn concat_channels(a: &[f32], ch_a: usize, b: &[f32], ch_b: usize, h: usize, w: usize) -> Vec<f32> {
    let hw = h * w;
    let mut out = vec![0.0f32; (ch_a + ch_b) * hw];
    out[..ch_a * hw].copy_from_slice(&a[..ch_a * hw]);
    out[ch_a * hw..].copy_from_slice(&b[..ch_b * hw]);
    out
}

pub fn add_inplace(a: &mut [f32], b: &[f32]) {
    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") {
            unsafe { add_inplace_avx2(a, b); }
            return;
        }
    }
    for (x, y) in a.iter_mut().zip(b.iter()) {
        *x += *y;
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
unsafe fn add_inplace_avx2(a: &mut [f32], b: &[f32]) {
    use std::arch::x86_64::*;
    let n = a.len();
    let n8 = n / 8 * 8;
    for i in (0..n8).step_by(8) {
        let va = _mm256_loadu_ps(a.as_ptr().add(i));
        let vb = _mm256_loadu_ps(b.as_ptr().add(i));
        _mm256_storeu_ps(a.as_mut_ptr().add(i), _mm256_add_ps(va, vb));
    }
    for i in n8..n {
        a[i] += b[i];
    }
}

pub fn batchnorm2d(
    input: &mut [f32],
    ch: usize,
    h: usize,
    w: usize,
    weight: &[f32],
    bias: &[f32],
    running_mean: &[f32],
    running_var: &[f32],
) {
    let hw = h * w;
    let eps = 1e-5f32;
    for c in 0..ch {
        let scale = weight[c] / (running_var[c] + eps).sqrt();
        let shift = bias[c] - running_mean[c] * scale;
        let offset = c * hw;
        #[cfg(target_arch = "x86_64")]
        {
            if is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") {
                unsafe {
                    use std::arch::x86_64::*;
                    let sv = _mm256_set1_ps(scale);
                    let shv = _mm256_set1_ps(shift);
                    let n8 = hw / 8 * 8;
                    for i in (0..n8).step_by(8) {
                        let v = _mm256_loadu_ps(input.as_ptr().add(offset + i));
                        let r = _mm256_fmadd_ps(v, sv, shv);
                        _mm256_storeu_ps(input.as_mut_ptr().add(offset + i), r);
                    }
                    for i in n8..hw {
                        input[offset + i] = input[offset + i] * scale + shift;
                    }
                }
                continue;
            }
        }
        for i in 0..hw {
            input[offset + i] = input[offset + i] * scale + shift;
        }
    }
}

// ======================== GRU ========================

pub fn bigru(
    input: &[f32],
    seq_len: usize,
    input_size: usize,
    hidden_size: usize,
    w_ih: &[f32],
    w_hh: &[f32],
    b_ih: &[f32],
    b_hh: &[f32],
    w_ih_r: &[f32],
    w_hh_r: &[f32],
    b_ih_r: &[f32],
    b_hh_r: &[f32],
) -> Vec<f32> {
    let out_size = 2 * hidden_size;
    let mut output = vec![0.0f32; seq_len * out_size];

    gru_one_dir(input, seq_len, input_size, hidden_size, w_ih, w_hh, b_ih, b_hh, &mut output, out_size, 0, false);
    gru_one_dir(input, seq_len, input_size, hidden_size, w_ih_r, w_hh_r, b_ih_r, b_hh_r, &mut output, out_size, hidden_size, true);

    output
}

fn gru_one_dir(
    input: &[f32],
    seq_len: usize,
    input_size: usize,
    hidden_size: usize,
    w_ih: &[f32],
    w_hh: &[f32],
    b_ih: &[f32],
    b_hh: &[f32],
    output: &mut [f32],
    out_stride: usize,
    out_offset: usize,
    reverse: bool,
) {
    let hs = hidden_size;
    let gate3 = 3 * hs;
    let mut h = vec![0.0f32; hs];
    let mut gates_x = vec![0.0f32; gate3];
    let mut gates_h = vec![0.0f32; gate3];

    for step in 0..seq_len {
        let t = if reverse { seq_len - 1 - step } else { step };
        let x = &input[t * input_size..(t + 1) * input_size];

        // gates_x = W_ih @ x + b_ih
        matvec(w_ih, x, b_ih, &mut gates_x, gate3, input_size);
        // gates_h = W_hh @ h + b_hh
        matvec(w_hh, &h, b_hh, &mut gates_h, gate3, hs);

        for i in 0..hs {
            let r = sigmoid(gates_x[i] + gates_h[i]);
            let z = sigmoid(gates_x[hs + i] + gates_h[hs + i]);
            let n = (gates_x[2 * hs + i] + r * gates_h[2 * hs + i]).tanh();
            h[i] = (1.0 - z) * n + z * h[i];
        }

        let out_base = t * out_stride + out_offset;
        output[out_base..out_base + hs].copy_from_slice(&h);
    }
}

/// y = A @ x + b
fn matvec(a: &[f32], x: &[f32], b: &[f32], y: &mut [f32], m: usize, k: usize) {
    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") {
            unsafe { matvec_avx2(a, x, b, y, m, k); }
            return;
        }
    }
    for mi in 0..m {
        let mut sum = b[mi];
        let row = &a[mi * k..(mi + 1) * k];
        for ki in 0..k {
            sum += row[ki] * x[ki];
        }
        y[mi] = sum;
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
unsafe fn matvec_avx2(a: &[f32], x: &[f32], b: &[f32], y: &mut [f32], m: usize, k: usize) {
    use std::arch::x86_64::*;
    let k8 = k / 8 * 8;
    for mi in 0..m {
        let row = &a[mi * k..];
        let mut acc = _mm256_setzero_ps();
        for ki in (0..k8).step_by(8) {
            let av = _mm256_loadu_ps(row.as_ptr().add(ki));
            let xv = _mm256_loadu_ps(x.as_ptr().add(ki));
            acc = _mm256_fmadd_ps(av, xv, acc);
        }
        // horizontal sum
        let hi = _mm256_extractf128_ps(acc, 1);
        let lo = _mm256_castps256_ps128(acc);
        let sum128 = _mm_add_ps(lo, hi);
        let sum64 = _mm_add_ps(sum128, _mm_movehl_ps(sum128, sum128));
        let sum32 = _mm_add_ss(sum64, _mm_shuffle_ps(sum64, sum64, 1));
        let mut sum = _mm_cvtss_f32(sum32);
        for ki in k8..k {
            sum += row[ki] * x[ki];
        }
        y[mi] = sum + b[mi];
    }
}

// ======================== Linear ========================

pub fn linear(
    input: &[f32],
    seq_len: usize,
    in_features: usize,
    weight: &[f32],
    bias: &[f32],
    out_features: usize,
) -> Vec<f32> {
    // This is just a batched matvec: for each t, y_t = W @ x_t + b
    let mut output = vec![0.0f32; seq_len * out_features];
    for t in 0..seq_len {
        let x = &input[t * in_features..(t + 1) * in_features];
        let y = &mut output[t * out_features..(t + 1) * out_features];
        matvec(weight, x, bias, y, out_features, in_features);
    }
    output
}

pub fn sigmoid_inplace(data: &mut [f32]) {
    for v in data.iter_mut() {
        *v = sigmoid(*v);
    }
}

#[inline(always)]
fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}
