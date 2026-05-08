use rayon::prelude::*;

const PAR_THRESHOLD: usize = 64;

// ===================== Reusable ops (same as fcpe/ops.rs) =====================

pub fn conv1d_int8(
    input: &[f32], in_ch: usize, t_in: usize,
    weight: &[i8], scales: &[f32], bias: &[f32],
    out_ch: usize, kernel: usize, pad: usize, stride: usize,
) -> Vec<f32> {
    let t_out = (t_in + 2 * pad - kernel) / stride + 1;
    let k_len = in_ch * kernel;
    let mut output = vec![0.0f32; out_ch * t_out];

    if kernel == 1 && pad == 0 && stride == 1 {
        gemv1d_int8(input, in_ch, t_in, weight, scales, bias, out_ch, &mut output, out_ch >= PAR_THRESHOLD);
        return output;
    }

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

    if out_ch >= PAR_THRESHOLD {
        output.par_chunks_mut(t_out).enumerate().for_each(|(oc, row)| compute_row(oc, row));
    } else {
        for oc in 0..out_ch {
            compute_row(oc, &mut output[oc * t_out..(oc + 1) * t_out]);
        }
    }
    output
}

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
            for ic in 0..in_ch { sum += w_row[ic] as f32 * input[ic * t + tt]; }
            out_row[tt] = sum * scale + b;
        }
    };
    if parallel {
        output.par_chunks_mut(t).enumerate().for_each(|(oc, row)| compute(oc, row));
    } else {
        for oc in 0..out_ch { compute(oc, &mut output[oc * t..(oc + 1) * t]); }
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
        _mm256_storeu_ps(out.as_mut_ptr().add(tt), _mm256_fmadd_ps(acc, scale_v, bias_v));
        tt += 8;
    }
    for tt2 in tt..t {
        let mut sum = 0.0f32;
        for ic in 0..in_ch { sum += w_row[ic] as f32 * input[ic * t + tt2]; }
        out[tt2] = sum * scale + bias;
    }
}

pub fn depthwise_conv1d(
    input: &[f32], channels: usize, t_in: usize,
    weight: &[f32], bias: &[f32], kernel: usize, pad: usize,
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
        output.par_chunks_mut(t_out).enumerate().for_each(|(ch, row)| compute(ch, row));
    } else {
        for ch in 0..channels { compute(ch, &mut output[ch * t_out..(ch + 1) * t_out]); }
    }
    output
}

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

pub fn leaky_relu_inplace(x: &mut [f32]) {
    for v in x.iter_mut() { if *v < 0.0 { *v *= 0.01; } }
}

pub fn silu_inplace(x: &mut [f32]) {
    for v in x.iter_mut() { *v = *v / (1.0 + (-*v).exp()); }
}

pub fn sigmoid_inplace(x: &mut [f32]) {
    for v in x.iter_mut() { *v = 1.0 / (1.0 + (-*v).exp()); }
}

pub fn glu_dim1(input: &[f32], half_ch: usize, t: usize) -> Vec<f32> {
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

/// GLU on dim=2 for [T, 2*D] row-major -> [T, D]
pub fn glu_dim2(input: &[f32], t: usize, full_d: usize) -> Vec<f32> {
    let half_d = full_d / 2;
    let mut output = vec![0.0f32; t * half_d];
    for row in 0..t {
        for i in 0..half_d {
            let a = input[row * full_d + i];
            let b = input[row * full_d + half_d + i];
            output[row * half_d + i] = a * (1.0 / (1.0 + (-b).exp()));
        }
    }
    output
}

pub fn linear_int8(x: &[f32], t: usize, in_dim: usize, weight: &[i8], scales: &[f32], bias: &[f32], out_dim: usize) -> Vec<f32> {
    let mut output = vec![0.0f32; t * out_dim];

    // Parallelize over T dimension (rows)
    output.par_chunks_mut(out_dim).enumerate().for_each(|(row, o_row)| {
        let x_row = &x[row * in_dim..(row + 1) * in_dim];
        for oc in 0..out_dim {
            let w_row = &weight[oc * in_dim..(oc + 1) * in_dim];
            #[cfg(target_arch = "x86_64")]
            let sum = if is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") {
                unsafe { dot_i8_f32_avx2(w_row, x_row, in_dim) }
            } else {
                let mut s = 0.0f32;
                for i in 0..in_dim { s += w_row[i] as f32 * x_row[i]; }
                s
            };
            #[cfg(not(target_arch = "x86_64"))]
            let sum = {
                let mut s = 0.0f32;
                for i in 0..in_dim { s += w_row[i] as f32 * x_row[i]; }
                s
            };
            o_row[oc] = sum * scales[oc] + bias[oc];
        }
    });

    output
}

pub fn linear_int8_no_bias(x: &[f32], t: usize, in_dim: usize, weight: &[i8], scales: &[f32], out_dim: usize) -> Vec<f32> {
    let mut output = vec![0.0f32; t * out_dim];

    output.par_chunks_mut(out_dim).enumerate().for_each(|(row, o_row)| {
        let x_row = &x[row * in_dim..(row + 1) * in_dim];
        for oc in 0..out_dim {
            let w_row = &weight[oc * in_dim..(oc + 1) * in_dim];
            #[cfg(target_arch = "x86_64")]
            let sum = if is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") {
                unsafe { dot_i8_f32_avx2(w_row, x_row, in_dim) }
            } else {
                let mut s = 0.0f32;
                for i in 0..in_dim { s += w_row[i] as f32 * x_row[i]; }
                s
            };
            #[cfg(not(target_arch = "x86_64"))]
            let sum = {
                let mut s = 0.0f32;
                for i in 0..in_dim { s += w_row[i] as f32 * x_row[i]; }
                s
            };
            o_row[oc] = sum * scales[oc];
        }
    });

    output
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
unsafe fn dot_i8_f32_avx2(w: &[i8], x: &[f32], n: usize) -> f32 {
    use std::arch::x86_64::*;
    let mut acc = _mm256_setzero_ps();
    let mut i = 0;
    while i + 8 <= n {
        let xv = _mm256_loadu_ps(x.as_ptr().add(i));
        // Load 8 i8 values, sign-extend to i32, convert to f32
        let wi8 = _mm_loadl_epi64(w.as_ptr().add(i) as *const __m128i);
        let wi32 = _mm256_cvtepi8_epi32(wi8);
        let wf32 = _mm256_cvtepi32_ps(wi32);
        acc = _mm256_fmadd_ps(wf32, xv, acc);
        i += 8;
    }
    let mut buf = [0.0f32; 8];
    _mm256_storeu_ps(buf.as_mut_ptr(), acc);
    let mut sum: f32 = buf.iter().sum();
    for j in i..n { sum += w[j] as f32 * x[j]; }
    sum
}

pub fn linear_fp32(x: &[f32], t: usize, in_dim: usize, weight: &[f32], bias: &[f32], out_dim: usize) -> Vec<f32> {
    let mut output = vec![0.0f32; t * out_dim];
    for row in 0..t {
        let x_row = &x[row * in_dim..(row + 1) * in_dim];
        for oc in 0..out_dim {
            let w_row = &weight[oc * in_dim..(oc + 1) * in_dim];
            let mut sum = 0.0f32;
            for i in 0..in_dim { sum += x_row[i] * w_row[i]; }
            output[row * out_dim + oc] = sum + bias[oc];
        }
    }
    output
}

pub fn transpose_ct_to_tc(input: &[f32], c: usize, t: usize) -> Vec<f32> {
    let mut out = vec![0.0f32; c * t];
    for ch in 0..c { for ti in 0..t { out[ti * c + ch] = input[ch * t + ti]; } }
    out
}

pub fn transpose_tc_to_ct(input: &[f32], t: usize, c: usize) -> Vec<f32> {
    let mut out = vec![0.0f32; c * t];
    for ti in 0..t { for ch in 0..c { out[ch * t + ti] = input[ti * c + ch]; } }
    out
}

pub fn add_inplace(x: &mut [f32], y: &[f32]) {
    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") {
            unsafe { add_inplace_avx2(x, y); }
            return;
        }
    }
    for i in 0..x.len() { x[i] += y[i]; }
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
    for j in i..n { x[j] += y[j]; }
}

pub fn scale_inplace(x: &mut [f32], s: f32) {
    for v in x.iter_mut() { *v *= s; }
}

// ===================== Multi-Head Self-Attention (optimized) =====================

pub fn softmax_rows(x: &mut [f32], rows: usize, cols: usize) {
    for r in 0..rows {
        let row = &mut x[r * cols..(r + 1) * cols];
        let max_val = row.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let mut sum = 0.0f32;
        for v in row.iter_mut() {
            *v = (*v - max_val).exp();
            sum += *v;
        }
        let inv_sum = 1.0 / sum;
        for v in row.iter_mut() { *v *= inv_sum; }
    }
}

/// GEMM: C[M,N] += A[M,K] @ B[K,N], row-major, AVX2+FMA accelerated.
fn gemm_f32(a: &[f32], b: &[f32], c: &mut [f32], m: usize, k: usize, n: usize) {
    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") {
            unsafe { gemm_f32_avx2(a, b, c, m, k, n); }
            return;
        }
    }
    for i in 0..m {
        for j in 0..n {
            let mut sum = 0.0f32;
            for p in 0..k { sum += a[i * k + p] * b[p * n + j]; }
            c[i * n + j] = sum;
        }
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
unsafe fn gemm_f32_avx2(a: &[f32], b: &[f32], c: &mut [f32], m: usize, k: usize, n: usize) {
    use std::arch::x86_64::*;
    for i in 0..m {
        let mut j = 0;
        while j + 8 <= n {
            let mut acc = _mm256_setzero_ps();
            for p in 0..k {
                let av = _mm256_set1_ps(*a.get_unchecked(i * k + p));
                let bv = _mm256_loadu_ps(b.as_ptr().add(p * n + j));
                acc = _mm256_fmadd_ps(av, bv, acc);
            }
            _mm256_storeu_ps(c.as_mut_ptr().add(i * n + j), acc);
            j += 8;
        }
        for jj in j..n {
            let mut sum = 0.0f32;
            for p in 0..k { sum += *a.get_unchecked(i * k + p) * *b.get_unchecked(p * n + jj); }
            *c.get_unchecked_mut(i * n + jj) = sum;
        }
    }
}

/// Multi-head self-attention with parallel heads and GEMM.
pub fn multi_head_attention(
    x: &[f32], t: usize, dim: usize, heads: usize, dim_head: usize,
    wq: &[i8], sq: &[f32],
    wkv: &[i8], skv: &[f32],
    wo: &[i8], so: &[f32], bo: &[f32],
) -> Vec<f32> {
    let hidden = heads * dim_head;

    let q = linear_int8_no_bias(x, t, dim, wq, sq, hidden);
    let kv = linear_int8_no_bias(x, t, dim, wkv, skv, 2 * hidden);

    let scale = 1.0 / (dim_head as f32).sqrt();
    let head_size = t * dim_head;

    // Extract per-head contiguous Q_h[T,D], K_h[T,D], V_h[T,D]
    let mut q_heads = vec![0.0f32; heads * head_size];
    let mut k_heads = vec![0.0f32; heads * head_size];
    let mut v_heads = vec![0.0f32; heads * head_size];

    for h in 0..heads {
        for ti in 0..t {
            for d in 0..dim_head {
                q_heads[h * head_size + ti * dim_head + d] = q[ti * hidden + h * dim_head + d];
                k_heads[h * head_size + ti * dim_head + d] = kv[ti * (2 * hidden) + h * dim_head + d];
                v_heads[h * head_size + ti * dim_head + d] = kv[ti * (2 * hidden) + hidden + h * dim_head + d];
            }
        }
    }

    // Parallel per-head attention
    let chunks: Vec<Vec<f32>> = (0..heads).into_par_iter().map(|h| {
        let q_h = &q_heads[h * head_size..(h + 1) * head_size];
        let k_h = &k_heads[h * head_size..(h + 1) * head_size];
        let v_h = &v_heads[h * head_size..(h + 1) * head_size];

        // K^T: [D, T]
        let mut k_t = vec![0.0f32; dim_head * t];
        for ti in 0..t {
            for d in 0..dim_head {
                k_t[d * t + ti] = k_h[ti * dim_head + d];
            }
        }

        // scores = Q_h[T,D] @ K_T[D,T] -> [T,T]
        let mut scores = vec![0.0f32; t * t];
        gemm_f32(q_h, &k_t, &mut scores, t, dim_head, t);
        for v in scores.iter_mut() { *v *= scale; }
        softmax_rows(&mut scores, t, t);

        // out = scores[T,T] @ V_h[T,D] -> [T,D]
        let mut out_h = vec![0.0f32; head_size];
        gemm_f32(&scores, v_h, &mut out_h, t, t, dim_head);
        out_h
    }).collect();

    // Interleave heads back
    let mut attn_out = vec![0.0f32; t * hidden];
    for h in 0..heads {
        for ti in 0..t {
            for d in 0..dim_head {
                attn_out[ti * hidden + h * dim_head + d] = chunks[h][ti * dim_head + d];
            }
        }
    }

    linear_int8(&attn_out, t, hidden, wo, so, bo, dim)
}
