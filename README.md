# Code4CleanAir: PM2.5 Episode-Aware Forecasting

[![Competition](https://img.shields.io/badge/ANRF%20AI--SE%20Hack-Phase%202-blue)](https://anrfonline.in)
[![Score](https://img.shields.io/badge/Leaderboard%20Score-0.8825-green)](https://kaggle.com)
[![License](https://img.shields.io/badge/License-ANRF%20Open-orange)](./LICENSE)

> **16-hour PM2.5 concentration forecasting with emphasis on episodic (extreme pollution) events**

---

## Overview

This repository contains our solution for the **ANRF AI-SE Hackathon Phase 2 - Theme 2: Pollution Forecasting** competition. The task is to predict 16 hours of PM2.5 concentrations from 10 hours of input data, with special emphasis on capturing **episodic events** (extreme pollution spikes).

### Key Results

| Metric | Score |
|--------|-------|
| **Leaderboard Score** | **0.8825** |
| Internal Episode SMAPE | 0.093 |
| Internal Episode Correlation | 0.988 |

---

## Approach: Master Blend Pipeline

Our solution uses a **4-phase progressive training strategy** with model ensembling:

```
Phase 1: Base Training (MSE Loss)
    ↓
Phase 2: Episodic Fine-tuning (Huber + Episode Weighting)
    ↓
Phase 3: Quantile Refinement (Huber + Pinball q=0.75)
    ↓
Phase 4: Pure Quantile (100% Pinball q=0.85)
    ↓
Master Blend: 30% Stable + 70% Spike + Curvature Correction
```

### Key Innovations

1. **Asymmetric Pinball Loss**: Penalizes under-prediction 5.67x more than over-prediction
2. **Dual-Expert Ensemble**: Combines global accuracy (Stable) with episode sensitivity (Spike)
3. **Curvature Correction**: Non-linear amplification for extreme values
4. **Log-Space Residual Prediction**: Model predicts delta from last observed frame

---

## Repository Structure

```
Code4CleanAir/
├── README.md                           # This file
├── LICENSE                             # ANRF Open License
├── EXECUTIVE_SUMMARY.md                # 2-page technical summary
├── PM25_MasterBlend_Documented.ipynb   # Main notebook (documented)
└── aisehack-theme-2/                   # Competition data (not included)
    ├── raw/                            # Training data
    └── test_in/                        # Test input
```

---

## Model Architecture

### ResGRU-UNet

A hybrid encoder-decoder network combining:
- **U-Net**: For spatial feature extraction with skip connections
- **ConvGRU**: For temporal dynamics modeling
- **Autoregressive Decoding**: 16-step sequential prediction

```
Input: (B, 16, 10, 140, 124)  # 16 channels × 10 hours × 140×124 grid

Encoder:
  ConvBlock(160→64) → MaxPool → ConvBlock(64→128) → MaxPool → ConvBlock(128→256) → AvgPool

Bottleneck:
  ConvBlock(256→256) → ConvGRU (×16 autoregressive steps)

Decoder (U-Net style):
  ConvTranspose + Skip → ConvBlock (×3 levels)

Output: (B, 16, 140, 124)  # 16 hours of predictions
```

---

## Input Features

| Feature | Description | Normalization |
|---------|-------------|---------------|
| `cpm25` | Chemical PM2.5 | Z-score (per-pixel) |
| `q2` | 2m specific humidity | Z-score (per-pixel) |
| `t2` | 2m temperature | Z-score (per-pixel) |
| `u10`, `v10` | Wind components | Z-score (per-pixel) |
| `pblh` | Boundary layer height | Z-score (per-pixel) |
| `psfc` | Surface pressure | Z-score (per-pixel) |
| `swdown` | Solar radiation | Z-score (per-pixel) |
| `rain` | Precipitation | Log-transform + Z-score |
| `wind_speed` | sqrt(u10²+v10²) | Engineered |
| `hour_sin/cos` | Cyclical time encoding | Engineered |

---

## Loss Function

### Pure Pinball Loss (q=0.85)

```python
def pinball_loss(pred, target, q=0.85):
    residual = target - pred  # Positive = under-prediction
    return mean(max(q * residual, (q-1) * residual))
```

| Condition | Penalty |
|-----------|---------|
| Under-prediction | 0.85 × |error| |
| Over-prediction | 0.15 × |error| |
| **Asymmetry ratio** | **5.67×** |

This forces the model to prefer over-prediction for extreme values, directly optimizing Episode SMAPE.

---

## Inference Pipeline

```python
# 1. Load both expert models
preds_stable = model_stable(test_input)  # Phase 2: Global expert
preds_spike = model_spike(test_input)    # Phase 4: Episode expert

# 2. Weighted blend
preds = 0.30 * preds_stable + 0.70 * preds_spike

# 3. Curvature correction for peaks > 100 µg/m³
stretch = 1.0 + (preds / 1000.0) ** 2
preds = np.where(preds > 100, preds * stretch, preds)
```

### Curvature Correction Effects

| Predicted Value | Correction | Effect |
|-----------------|------------|--------|
| 100 µg/m³ | ×1.01 | +1% |
| 300 µg/m³ | ×1.09 | +9% |
| 600 µg/m³ | ×1.36 | +36% |
| 1000 µg/m³ | ×2.00 | +100% |

---

## Requirements

```
torch>=2.0
numpy>=1.24
```

**Hardware**: NVIDIA Tesla T4 (16GB) or equivalent

---

## Usage

### Training

```python
# Run the main notebook
python -c "exec(open('PM25_MasterBlend_Documented.ipynb').read())"
```

### Inference Only

```python
# Load checkpoint and run inference
model = ResGRUUNet(Config)
model.load_state_dict(torch.load('best_pqr_finetune.pt')['model_state_dict'])
preds = run_inference_single(model, norm_stats, device)
```

---

## Competition Details

- **Competition**: ANRF AI-SE Hack Phase 2 - Theme 2
- **Task**: 16-hour PM2.5 forecasting from 10-hour input
- **Grid**: 140 × 124 (WRF-Chem domain over India)
- **Evaluation**: Weighted combination of Global SMAPE, Episode SMAPE, Episode Correlation

---

## Citation

```bibtex
@misc{code4cleanair2026,
  title={PM2.5 Episode-Aware Forecasting with Asymmetric Quantile Loss},
  author={Code4CleanAir Team},
  year={2026},
  howpublished={ANRF AI-SE Hackathon Phase 2}
}
```

---

## License

This project is licensed under the **ANRF Open License** - see [LICENSE](./LICENSE) for details.

---

## Acknowledgments

- ANRF and IIT Delhi for organizing the competition
- Competition hosts for the WRF-Chem dataset
- Kaggle for compute resources

---

**Team Code4CleanAir** | ANRF AI-SE Hack 2026
