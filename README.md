# PM2.5 Pollution Forecasting - Master Blend

**ANRF AI-SE Hack Phase 2 | Theme 2**  
**Score: 0.8825**

---

## About

This notebook predicts 16 hours of PM2.5 concentrations from 10 hours of meteorological input over a 140×124 grid covering India. It uses a **Master Blend** strategy combining two model experts for balanced predictions.

---

## Method

### Model: ResGRU-UNet

- Encoder-decoder architecture with ConvGRU in the bottleneck
- Autoregressive: runs decoder 16 times for 16-hour forecast
- Predicts residuals in log-space from the last input frame

### Training: Pure Quantile Refinement (PQR)

Starting from Phase 3 checkpoint (score 0.8803), fine-tunes with:

- **Loss**: 100% Pinball at q=0.85 (no Huber)
- **LR**: 1e-5
- **Epochs**: 5 with early stopping (patience=3)

Pinball loss at q=0.85 penalizes under-prediction of high values ~5.7× more than over-prediction.

### Inference: Master Blend

Combines two experts:

| Expert | Weight | Purpose |
|--------|--------|---------|
| Stable (Phase 2) | 0.30 | Keeps global SMAPE low |
| Spike (PQR) | 0.70 | Captures episode peaks |

After blending, applies **Curvature Correction** on peaks > 100 µg/m³:
```
stretch = 1 + (pred/1000)²
```

---

## Features

16 input channels (13 base + 3 engineered):

- **Meteorological**: cpm25, q2, t2, u10, v10, pblh, psfc, swdown, rain
- **Emissions**: PM25, NOx, SO2, NH3
- **Engineered**: wind_speed, hour_sin, hour_cos

---

## Output

- **Shape**: (218, 140, 124, 16)
- **Range**: [0.0, 6161.3] µg/m³
- **Mean**: 42.6 µg/m³

---

## Requirements

- PyTorch 2.0+
- NumPy
- CUDA GPU

---

## License

ANRF Open License
