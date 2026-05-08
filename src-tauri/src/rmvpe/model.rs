use crate::rmvpe::format::ScrModel;
use crate::rmvpe::ops;

pub struct RmvpeModel {
    scr: ScrModel,
}

impl RmvpeModel {
    pub fn load(path: &str) -> Result<Self, String> {
        let scr = ScrModel::load(path).map_err(|e| format!("failed to load model: {}", e))?;
        Ok(RmvpeModel { scr })
    }

    pub fn forward(&self, mel: &[f32], n_mels: usize, t: usize) -> Vec<f32> {
        let h = t;
        let w = n_mels;
        let mut input = vec![0.0f32; h * w];
        for mel_bin in 0..n_mels {
            for frame in 0..t {
                input[frame * w + mel_bin] = mel[mel_bin * t + frame];
            }
        }

        let bn_w = self.scr.get_fp32("encoder.bn.weight").unwrap();
        let bn_b = self.scr.get_fp32("encoder.bn.bias").unwrap();
        let bn_m = self.scr.get_fp32("encoder.bn.running_mean").unwrap();
        let bn_v = self.scr.get_fp32("encoder.bn.running_var").unwrap();
        ops::batchnorm2d(&mut input, 1, h, w, bn_w, bn_b, bn_m, bn_v);

        // Encoder
        let enc_channels = [16usize, 32, 64, 128, 256];
        let mut in_ch = 1usize;
        let mut cur_h = h;
        let mut cur_w = w;
        let mut x = input;
        let mut skips: Vec<(Vec<f32>, usize, usize, usize)> = Vec::with_capacity(5);

        for stage in 0..5u8 {
            let out_ch = enc_channels[stage as usize];
            let (pooled, skip) = self.encoder_stage(&x, in_ch, cur_h, cur_w, out_ch, stage);
            skips.push((skip, out_ch, cur_h, cur_w));
            x = pooled;
            in_ch = out_ch;
            cur_h /= 2;
            cur_w /= 2;
        }

        // Intermediate
        let mid_in = [256usize, 512, 512, 512];
        let mid_out = [512usize, 512, 512, 512];
        for stage in 0..4u8 {
            x = self.intermediate_stage(&x, mid_in[stage as usize], cur_h, cur_w, mid_out[stage as usize], stage);
            in_ch = mid_out[stage as usize];
        }

        // Decoder
        let dec_in = [512usize, 256, 128, 64, 32];
        let dec_out = [256usize, 128, 64, 32, 16];
        for stage in 0..5u8 {
            let si = stage as usize;
            let (ref skip_data, skip_ch, skip_h, skip_w) = skips[4 - si];
            x = self.decoder_stage(&x, dec_in[si], cur_h, cur_w, dec_out[si], stage, skip_data, skip_ch, skip_h, skip_w);
            in_ch = dec_out[si];
            cur_h *= 2;
            cur_w *= 2;
        }

        // Head conv2d 16 -> 3
        let head_w = self.scr.get_fp16_as_f32("head.conv.weight").unwrap();
        let head_b = self.scr.get_fp16_as_f32("head.conv.bias").unwrap();
        let x = ops::conv2d_fp32(&x, 16, cur_h, cur_w, &head_w, &head_b, 3, 3, 3, 1, 1, 1, 1, false);

        // Reshape [3, T, 128] -> [T, 384]
        let t_out = cur_h;
        let mut reshaped = vec![0.0f32; t_out * 384];
        for ti in 0..t_out {
            for c in 0..3 {
                for wi in 0..128 {
                    reshaped[ti * 384 + c * 128 + wi] = x[c * t_out * 128 + ti * 128 + wi];
                }
            }
        }

        // BiGRU
        let gru_w_ih = self.scr.get_fp16_as_f32("gru.weight_ih_l0").unwrap();
        let gru_w_hh = self.scr.get_fp16_as_f32("gru.weight_hh_l0").unwrap();
        let gru_b_ih = self.scr.get_fp16_as_f32("gru.bias_ih_l0").unwrap();
        let gru_b_hh = self.scr.get_fp16_as_f32("gru.bias_hh_l0").unwrap();
        let gru_w_ih_r = self.scr.get_fp16_as_f32("gru.weight_ih_l0_reverse").unwrap();
        let gru_w_hh_r = self.scr.get_fp16_as_f32("gru.weight_hh_l0_reverse").unwrap();
        let gru_b_ih_r = self.scr.get_fp16_as_f32("gru.bias_ih_l0_reverse").unwrap();
        let gru_b_hh_r = self.scr.get_fp16_as_f32("gru.bias_hh_l0_reverse").unwrap();

        let gru_out = ops::bigru(
            &reshaped, t_out, 384, 256,
            &gru_w_ih, &gru_w_hh, &gru_b_ih, &gru_b_hh,
            &gru_w_ih_r, &gru_w_hh_r, &gru_b_ih_r, &gru_b_hh_r,
        );

        // Linear + Sigmoid
        let lin_w = self.scr.get_fp16_as_f32("linear.weight").unwrap();
        let lin_b = self.scr.get_fp16_as_f32("linear.bias").unwrap();
        let mut logits = ops::linear(&gru_out, t_out, 512, &lin_w, &lin_b, 360);
        ops::sigmoid_inplace(&mut logits);

        logits
    }

    fn encoder_stage(
        &self, input: &[f32], in_ch: usize, h: usize, w: usize, out_ch: usize, stage: u8,
    ) -> (Vec<f32>, Vec<f32>) {
        let mut x = self.conv_block_res(input, in_ch, h, w, out_ch, stage, 0, b'e');
        for block in 1..4u8 {
            x = self.conv_block_res(&x, out_ch, h, w, out_ch, stage, block, b'e');
        }
        let skip = x.clone();
        let pooled = ops::avg_pool2d_2x2(&x, out_ch, h, w);
        (pooled, skip)
    }

    fn intermediate_stage(
        &self, input: &[f32], in_ch: usize, h: usize, w: usize, out_ch: usize, stage: u8,
    ) -> Vec<f32> {
        let mut x = self.conv_block_res(input, in_ch, h, w, out_ch, stage, 0, b'm');
        for block in 1..4u8 {
            x = self.conv_block_res(&x, out_ch, h, w, out_ch, stage, block, b'm');
        }
        x
    }

    fn decoder_stage(
        &self, input: &[f32], in_ch: usize, in_h: usize, in_w: usize,
        out_ch: usize, stage: u8, skip: &[f32], _skip_ch: usize, skip_h: usize, skip_w: usize,
    ) -> Vec<f32> {
        let up_w_name = format!("dec.{}.up.weight", stage);
        let up_b_name = format!("dec.{}.up.bias", stage);
        let (up_w, up_s) = self.scr.get_int8_weight(&up_w_name).unwrap();
        let up_b = self.scr.get_fp32(&up_b_name).unwrap();
        let mut x = ops::conv_transpose2d_int8(
            input, in_ch, in_h, in_w, up_w, up_s, up_b,
            out_ch, 3, 3, 1, 1, 2, 2, 1, 1, true,
        );

        x = ops::concat_channels(&x, out_ch, skip, out_ch, skip_h, skip_w);

        let mut ch = out_ch * 2;
        x = self.conv_block_res(&x, ch, skip_h, skip_w, out_ch, stage, 0, b'd');
        for block in 1..4u8 {
            x = self.conv_block_res(&x, out_ch, skip_h, skip_w, out_ch, stage, block, b'd');
        }
        x
    }

    fn conv_block_res(
        &self, input: &[f32], in_ch: usize, h: usize, w: usize,
        out_ch: usize, stage: u8, block: u8, section: u8,
    ) -> Vec<f32> {
        let prefix = match section {
            b'e' => format!("enc.{}.{}", stage, block),
            b'm' => format!("mid.{}.{}", stage, block),
            b'd' => format!("dec.{}.{}", stage, block),
            _ => unreachable!(),
        };

        let act1 = self.scr.act_scales.get(&format!("{}.conv1", prefix)).copied().unwrap_or(0.0);
        let w1_name = format!("{}.conv1.weight", prefix);
        let b1_name = format!("{}.conv1.bias", prefix);
        let (w1, s1) = self.scr.get_int8_weight(&w1_name).unwrap();
        let b1 = self.scr.get_fp32(&b1_name).unwrap();
        let c1 = ops::conv2d_int8(input, in_ch, h, w, w1, s1, b1, out_ch, 3, 3, 1, 1, 1, 1, true, act1);

        let act2 = self.scr.act_scales.get(&format!("{}.conv2", prefix)).copied().unwrap_or(0.0);
        let w2_name = format!("{}.conv2.weight", prefix);
        let b2_name = format!("{}.conv2.bias", prefix);
        let (w2, s2) = self.scr.get_int8_weight(&w2_name).unwrap();
        let b2 = self.scr.get_fp32(&b2_name).unwrap();
        let mut c2 = ops::conv2d_int8(&c1, out_ch, h, w, w2, s2, b2, out_ch, 3, 3, 1, 1, 1, 1, true, act2);

        if in_ch != out_ch {
            let act_sc = self.scr.act_scales.get(&format!("{}.shortcut", prefix)).copied().unwrap_or(0.0);
            let ws_name = format!("{}.shortcut.weight", prefix);
            let bs_name = format!("{}.shortcut.bias", prefix);
            let (ws, ss) = self.scr.get_int8_weight(&ws_name).unwrap();
            let bs = self.scr.get_fp32(&bs_name).unwrap();
            let sc = ops::conv2d_int8(input, in_ch, h, w, ws, ss, bs, out_ch, 1, 1, 0, 0, 1, 1, false, act_sc);
            ops::add_inplace(&mut c2, &sc);
        } else {
            ops::add_inplace(&mut c2, input);
        }

        c2
    }
}
