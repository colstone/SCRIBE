use crate::some::format::ScrModel;
use crate::some::ops;

/// Full SOME forward pass.
/// Input: mel [n_mels, T] channel-major.
/// Output: (midi_probs [T, n_bins], bounds [T])
pub fn forward(model: &ScrModel, mel: &[f32], n_mels: usize, t: usize) -> (Vec<f32>, Vec<f32>) {
    let dim = 512;
    let n_bins = model.config.midi_num_bins as usize;

    let x_tc = ops::transpose_ct_to_tc(mel, n_mels, t);

    let inln_w = model.get_fp16_as_f32("inln.weight").unwrap();
    let inln_b = model.get_fp32("inln.bias").unwrap();
    let mut midi = ops::linear_fp32(&x_tc, t, n_mels, &inln_w, inln_b, dim);

    let inln1_w = model.get_fp16_as_f32("inln1.weight").unwrap();
    let inln1_b = model.get_fp32("inln1.bias").unwrap();
    let mut bound = ops::linear_fp32(&x_tc, t, n_mels, &inln1_w, inln1_b, dim);

    for i in 0..8 {
        let (m, b) = gcf_layer(model, &midi, &bound, t, dim, i);
        midi = m;
        bound = b;
    }

    midi = conformer_block(model, &midi, t, dim, "final_att1");
    bound = conformer_block(model, &bound, t, dim, "final_att2");

    // Output heads: FP16
    let out_w = model.get_fp16_as_f32("outln.weight").unwrap();
    let out_b = model.get_fp32("outln.bias").unwrap();
    let mut midi_probs = ops::linear_fp32(&midi, t, dim, &out_w, out_b, n_bins);
    ops::sigmoid_inplace(&mut midi_probs);

    let cut_w = model.get_fp16_as_f32("cutheard.weight").unwrap();
    let cut_b = model.get_fp32("cutheard.bias").unwrap();
    let mut bounds_raw = ops::linear_fp32(&bound, t, dim, &cut_w, cut_b, 1);
    ops::sigmoid_inplace(&mut bounds_raw);
    let bounds: Vec<f32> = (0..t).map(|i| bounds_raw[i]).collect();

    (midi_probs, bounds)
}

fn gcf_layer(model: &ScrModel, midi_in: &[f32], bound_in: &[f32], t: usize, dim: usize, idx: usize) -> (Vec<f32>, Vec<f32>) {
    let midi = conformer_block(model, midi_in, t, dim, &format!("cf{idx}.att1"));
    let bound = conformer_block(model, bound_in, t, dim, &format!("cf{idx}.att2"));

    // GLU cross-connections
    let (glu1_w, glu1_s) = model.get_int8_weight(&format!("cf{idx}.glu1.weight")).unwrap();
    let glu1_b = model.get_fp32(&format!("cf{idx}.glu1.bias")).unwrap();
    let glu1_out = ops::linear_int8(&midi, t, dim, glu1_w, glu1_s, glu1_b, dim * 2);
    let midis = ops::glu_dim2(&glu1_out, t, dim * 2);

    let (glu2_w, glu2_s) = model.get_int8_weight(&format!("cf{idx}.glu2.weight")).unwrap();
    let glu2_b = model.get_fp32(&format!("cf{idx}.glu2.bias")).unwrap();
    let glu2_out = ops::linear_int8(&bound, t, dim, glu2_w, glu2_s, glu2_b, dim * 2);
    let bounds = ops::glu_dim2(&glu2_out, t, dim * 2);

    // midi_out = midi + GLU(bound), bound_out = bound + GLU(midi)
    let mut midi_out = midi;
    ops::add_inplace(&mut midi_out, &bounds);
    let mut bound_out = bound;
    ops::add_inplace(&mut bound_out, &midis);

    (midi_out, bound_out)
}

fn conformer_block(model: &ScrModel, x: &[f32], t: usize, dim: usize, prefix: &str) -> Vec<f32> {
    let n1_w = model.get_fp32(&format!("{prefix}.norm1.weight")).unwrap();
    let n1_b = model.get_fp32(&format!("{prefix}.norm1.bias")).unwrap();
    let mut x_ln = x.to_vec();
    ops::layer_norm(&mut x_ln, t, dim, n1_w, n1_b);
    let ffn1_out = ffn(model, &x_ln, t, dim, &format!("{prefix}.ffn1"));
    let mut out = x.to_vec();
    for i in 0..out.len() { out[i] += ffn1_out[i] * 0.5; }

    let n2_w = model.get_fp32(&format!("{prefix}.norm2.weight")).unwrap();
    let n2_w = model.get_fp32(&format!("{prefix}.norm2.weight")).unwrap();
    let n2_b = model.get_fp32(&format!("{prefix}.norm2.bias")).unwrap();
    let mut x_ln2 = out.clone();
    ops::layer_norm(&mut x_ln2, t, dim, n2_w, n2_b);
    let (wq, sq) = model.get_int8_weight(&format!("{prefix}.att.q.weight")).unwrap();
    let (wkv, skv) = model.get_int8_weight(&format!("{prefix}.att.kv.weight")).unwrap();
    let (wo, so) = model.get_int8_weight(&format!("{prefix}.att.out.weight")).unwrap();
    let bo = model.get_fp32(&format!("{prefix}.att.out.bias")).unwrap();
    let att_out = ops::multi_head_attention(&x_ln2, t, dim, 8, 64, wq, sq, wkv, skv, wo, so, bo);
    ops::add_inplace(&mut out, &att_out);

    let n3_w = model.get_fp32(&format!("{prefix}.norm3.weight")).unwrap();
    let n3_b = model.get_fp32(&format!("{prefix}.norm3.bias")).unwrap();
    let mut x_ln3 = out.clone();
    ops::layer_norm(&mut x_ln3, t, dim, n3_w, n3_b);
    let conv_out = conform_conv(model, &x_ln3, t, dim, prefix);
    ops::add_inplace(&mut out, &conv_out);

    let n4_w = model.get_fp32(&format!("{prefix}.norm4.weight")).unwrap();
    let n4_b = model.get_fp32(&format!("{prefix}.norm4.bias")).unwrap();
    let mut x_ln4 = out.clone();
    ops::layer_norm(&mut x_ln4, t, dim, n4_w, n4_b);
    let ffn2_out = ffn(model, &x_ln4, t, dim, &format!("{prefix}.ffn2"));
    for i in 0..out.len() { out[i] += ffn2_out[i] * 0.5; }

    let n5_w = model.get_fp32(&format!("{prefix}.norm5.weight")).unwrap();
    let n5_b = model.get_fp32(&format!("{prefix}.norm5.bias")).unwrap();
    ops::layer_norm(&mut out, t, dim, n5_w, n5_b);

    out
}

fn ffn(model: &ScrModel, x: &[f32], t: usize, dim: usize, prefix: &str) -> Vec<f32> {
    // Linear(dim, dim*4) -> SiLU -> Linear(dim*4, dim)
    let (w1, s1) = model.get_int8_weight(&format!("{prefix}.ln1.weight")).unwrap();
    let b1 = model.get_fp32(&format!("{prefix}.ln1.bias")).unwrap();
    let mut h = ops::linear_int8(x, t, dim, w1, s1, b1, dim * 4);
    ops::silu_inplace(&mut h);

    let (w2, s2) = model.get_int8_weight(&format!("{prefix}.ln2.weight")).unwrap();
    let b2 = model.get_fp32(&format!("{prefix}.ln2.bias")).unwrap();
    ops::linear_int8(&h, t, dim * 4, w2, s2, b2, dim)
}

fn conform_conv(model: &ScrModel, x: &[f32], t: usize, dim: usize, block_prefix: &str) -> Vec<f32> {
    // x: [T, dim] row-major -> transpose to [dim, T] for conv

    let x_ct = ops::transpose_tc_to_ct(x, t, dim);

    // Pointwise conv1: Conv1d(dim, 2*dim, 1) INT8
    let (pw1_w, pw1_s) = model.get_int8_weight(&format!("{block_prefix}.conv.pw1.weight")).unwrap();
    let pw1_b = model.get_fp32(&format!("{block_prefix}.conv.pw1.bias")).unwrap();
    let pw1_out = ops::conv1d_int8(&x_ct, dim, t, pw1_w, pw1_s, pw1_b, dim * 2, 1, 0, 1);

    // GLU on dim=1 (channel dim): [2*dim, T] -> [dim, T]
    let glu_out = ops::glu_dim1(&pw1_out, dim, t);

    // Depthwise conv: FP16 (BN already folded)
    let dw_w = model.get_fp16_as_f32(&format!("{block_prefix}.conv.dw.weight")).unwrap();
    let dw_b = model.get_fp32(&format!("{block_prefix}.conv.dw.bias")).unwrap();
    let mut dw_out = ops::depthwise_conv1d(&glu_out, dim, t, &dw_w, dw_b, 31, 15);

    // SiLU
    ops::silu_inplace(&mut dw_out);

    // Pointwise conv2: Conv1d(dim, dim, 1) INT8
    let (pw2_w, pw2_s) = model.get_int8_weight(&format!("{block_prefix}.conv.pw2.weight")).unwrap();
    let pw2_b = model.get_fp32(&format!("{block_prefix}.conv.pw2.bias")).unwrap();
    let pw2_out = ops::conv1d_int8(&dw_out, dim, t, pw2_w, pw2_s, pw2_b, dim, 1, 0, 1);

    // Transpose back to [T, dim]
    ops::transpose_ct_to_tc(&pw2_out, dim, t)
}
