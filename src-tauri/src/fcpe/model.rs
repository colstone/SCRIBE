use crate::fcpe::format::ScrModel;
use crate::fcpe::ops;

/// Run the full FCPE model forward pass.
/// Input: mel spectrogram [N_MELS, T] channel-major.
/// Output: f0 per frame Vec<f64>, timestep f64.
pub fn forward(model: &ScrModel, mel: &[f32], n_mels: usize, t: usize) -> Vec<f32> {
    // === Input stack ===
    // Conv1d(128, 512, 3, pad=1): FP16
    let w1 = model.get_fp16_as_f32("input_conv1.weight").unwrap();
    let b1 = model.get_fp32("input_conv1.bias").unwrap();
    let mut x = ops::conv1d_fp32(mel, n_mels, t, &w1, b1, 512, 3, 1, 1);

    // GroupNorm(4, 512)
    let gn_w = model.get_fp32("input_gn.weight").unwrap();
    let gn_b = model.get_fp32("input_gn.bias").unwrap();
    ops::group_norm(&mut x, 512, t, 4, gn_w, gn_b);

    // LeakyReLU
    ops::leaky_relu_inplace(&mut x);

    // Conv1d(512, 512, 3, pad=1): FP16
    let w2 = model.get_fp16_as_f32("input_conv2.weight").unwrap();
    let b2 = model.get_fp32("input_conv2.bias").unwrap();
    x = ops::conv1d_fp32(&x, 512, t, &w2, b2, 512, 3, 1, 1);

    // === 6x Conformer layers (conv_only) ===
    for i in 0..6 {
        x = conformer_layer(model, &x, 512, t, i);
    }

    // === Final LayerNorm + output proj ===
    // x is [512, T] channel-major, need [T, 512] for LayerNorm
    let mut x_tc = ops::transpose_ct_to_tc(&x, 512, t);
    let fln_w = model.get_fp32("final_ln.weight").unwrap();
    let fln_b = model.get_fp32("final_ln.bias").unwrap();
    ops::layer_norm(&mut x_tc, t, 512, fln_w, fln_b);

    // Linear(512, 360): FP16 unfolded weight
    let out_w = model.get_fp16_as_f32("output.weight").unwrap();
    let out_b = model.get_fp32("output.bias").unwrap();
    let mut logits = ops::linear_fp32(&x_tc, t, 512, &out_w, out_b, 360);

    // Sigmoid
    ops::sigmoid_inplace(&mut logits);

    logits // [T, 360] row-major
}

fn conformer_layer(model: &ScrModel, input: &[f32], dim: usize, t: usize, idx: usize) -> Vec<f32> {
    // ConformerConvModule: LayerNorm -> Transpose -> Conv1d(512,2048,1) -> GLU -> DW Conv1d(1024,1024,31) -> SiLU -> Conv1d(1024,512,1) -> Transpose
    // residual: x = x + conformer(x)

    // LayerNorm (on channel dim -> need [T, 512])
    let ln_w = model.get_fp32(&format!("layer{idx}.ln.weight")).unwrap();
    let ln_b = model.get_fp32(&format!("layer{idx}.ln.bias")).unwrap();
    let mut x_tc = ops::transpose_ct_to_tc(input, dim, t);
    ops::layer_norm(&mut x_tc, t, dim, ln_w, ln_b);

    // Back to [512, T] for Conv1d
    let x_ct = ops::transpose_tc_to_ct(&x_tc, t, dim);

    // Pointwise Conv1d(512, 2048, 1): INT8
    let (pw1_w, pw1_s) = model.get_int8_weight(&format!("layer{idx}.pw1.weight")).unwrap();
    let pw1_b = model.get_fp32(&format!("layer{idx}.pw1.bias")).unwrap();
    let pw1_out = ops::conv1d_int8(&x_ct, 512, t, pw1_w, pw1_s, pw1_b, 2048, 1, 0, 1);

    // GLU: [2048, T] -> [1024, T]
    let glu_out = ops::glu(&pw1_out, 1024, t);

    // DepthwiseConv1d(1024, 1024, 31, pad=15, groups=1024): FP16
    let dw_w = model.get_fp16_as_f32(&format!("layer{idx}.dw.weight")).unwrap();
    let dw_b = model.get_fp32(&format!("layer{idx}.dw.bias")).unwrap();
    let mut dw_out = ops::depthwise_conv1d(&glu_out, 1024, t, &dw_w, dw_b, 31, 15);

    // SiLU
    ops::silu_inplace(&mut dw_out);

    // Pointwise Conv1d(1024, 512, 1): INT8
    let (pw2_w, pw2_s) = model.get_int8_weight(&format!("layer{idx}.pw2.weight")).unwrap();
    let pw2_b = model.get_fp32(&format!("layer{idx}.pw2.bias")).unwrap();
    let pw2_out = ops::conv1d_int8(&dw_out, 1024, t, pw2_w, pw2_s, pw2_b, 512, 1, 0, 1);

    // Residual add
    let mut output = input.to_vec();
    ops::add_inplace(&mut output, &pw2_out);

    output
}

/// Decode latent [T, 360] to f0 using local_argmax decoder.
pub fn latent_to_f0(latent: &[f32], t: usize, cent_table: &[f32], threshold: f32) -> Vec<f64> {
    let out_dims = 360;
    let mut f0 = vec![0.0f64; t];

    for frame in 0..t {
        let row = &latent[frame * out_dims..(frame + 1) * out_dims];

        // Find argmax
        let mut max_val = f32::NEG_INFINITY;
        let mut max_idx: usize = 0;
        for i in 0..out_dims {
            if row[i] > max_val {
                max_val = row[i];
                max_idx = i;
            }
        }

        if max_val <= threshold {
            f0[frame] = 0.0;
            continue;
        }

        // Local argmax: take 9 bins around peak
        let start = if max_idx >= 4 { max_idx - 4 } else { 0 };
        let end = (max_idx + 5).min(out_dims);

        let mut weighted_sum = 0.0f64;
        let mut weight_sum = 0.0f64;
        for i in start..end {
            weighted_sum += cent_table[i] as f64 * row[i] as f64;
            weight_sum += row[i] as f64;
        }

        if weight_sum > 1e-8 {
            let cents = weighted_sum / weight_sum;
            f0[frame] = 10.0 * 2.0f64.powf(cents / 1200.0);
        }
    }

    f0
}
