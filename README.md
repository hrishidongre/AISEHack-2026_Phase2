# PM2.5 Pollution Forecasting

<div align="center">

**Master Blend Pipeline for Episode-Aware Air Quality Prediction**

[![Competition](https://img.shields.io/badge/ANRF_AI--SE_Hack-Phase_2-4361ee?style=for-the-badge)](https://anrfonline.in)
[![Score](https://img.shields.io/badge/Score-0.8825-06d6a0?style=for-the-badge)](https://kaggle.com)
[![Theme](https://img.shields.io/badge/Theme_2-Pollution_Forecasting-ff6b6b?style=for-the-badge)](https://kaggle.com)

---

*Predicting 16 hours of PM2.5 concentrations from 10 hours of meteorological data*

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Training Strategy](#-training-strategy)
- [Master Blend Inference](#-master-blend-inference)
- [Input Features](#-input-features)
- [Results](#-results)
- [Requirements](#-requirements)

---

## Overview

This solution tackles the challenge of forecasting PM2.5 pollution levels with special emphasis on **episodic events** (extreme pollution spikes). The approach combines two specialized model experts:

<div align="center">

| Stable Expert | Spike Expert |
|:---:|:---:|
| Maintains global accuracy | Captures extreme peaks |
| Weight: **30%** | Weight: **70%** |

</div>

---

## Architecture

### ResGRU-UNet

```
┌─────────────────────────────────────────────────────────────┐
│                         INPUT                                │
│              (Batch, 16 channels, 10 hours, 140, 124)       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       ENCODER                                │
│  ┌─────────┐      ┌─────────┐      ┌─────────┐              │
│  │ Block 1 │ ───► │ Block 2 │ ───► │ Block 3 │              │
│  │  64 ch  │      │ 128 ch  │      │ 256 ch  │              │
│  └─────────┘      └─────────┘      └─────────┘              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    BOTTLENECK                                │
│                                                              │
│                 ┌──────────────┐                            │
│                 │   ConvGRU    │ ◄─── Runs 16× autoregressive│
│                 │  256 hidden  │                            │
│                 └──────────────┘                            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                       DECODER                                │
│  ┌─────────┐      ┌─────────┐      ┌─────────┐              │
│  │ Block 1 │ ◄─── │ Block 2 │ ◄─── │ Block 3 │              │
│  │  32 ch  │      │  64 ch  │      │ 128 ch  │              │
│  └─────────┘      └─────────┘      └─────────┘              │
│        ↑               ↑               ↑                     │
│        └───────────────┴───────────────┘                     │
│              Skip Connections (U-Net style)                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        OUTPUT                                │
│              (Batch, 16 hours, 140, 124)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Training Strategy

### Pure Quantile Refinement (PQR)

<div align="center">

| Parameter | Value |
|:---------:|:-----:|
|  Loss | 100% Pinball (q=0.85) |
|  Learning Rate | 1e-5 |
|  Epochs | 5 |
|  Early Stopping | Patience = 3 |
|  Batch Size | 4 |

</div>

#### Why Pinball Loss at q=0.85?

```
Under-prediction penalty:  0.85 × |error|  ████████░░
Over-prediction penalty:   0.15 × |error|  ██░░░░░░░░

Asymmetry ratio: 5.67×
```

>  This forces the model to **prefer over-prediction** for extreme values, directly optimizing for Episode SMAPE.

---

##  Master Blend Inference

```
                    ┌─────────────────┐
                    │   Test Input    │
                    │  (218 samples)  │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
     ┌────────────────┐            ┌────────────────┐
     │  Stable Expert│            │  Spike Expert │
     │   (Phase 2)    │            │     (PQR)      │
     │  Score: 0.8768 │            │  Score: 0.8803 │
     └───────┬────────┘            └───────┬────────┘
             │                             │
             │ × 0.30                      │ × 0.70
             │                             │
             └──────────────┬──────────────┘
                            │
                            ▼
                   ┌────────────────┐
                   │    BLEND       │
                   │  0.3S + 0.7P   │
                   └───────┬────────┘
                           │
                           ▼
                   ┌────────────────┐
                   │   CURVATURE    │
                   │  CORRECTION    │
                   │  (peaks >100)  │
                   └───────┬────────┘
                           │
                           ▼
                   ┌────────────────┐
                   │  Final Output │
                   │ [0.0, 6161.3]  │
                   │  mean = 42.6   │
                   └────────────────┘
```

### Curvature Correction Formula

```python
stretch = 1 + (pred / 1000)²
```

| Prediction | Correction | Boost |
|:----------:|:----------:|:-----:|
| 100 µg/m³  | × 1.01     | +1%   |
| 300 µg/m³  | × 1.09     | +9%   |
| 500 µg/m³  | × 1.25     | +25%  |
| 1000 µg/m³ | × 2.00     | +100% |

---

##  Input Features

<div align="center">

### 16 Channels = 13 Base + 3 Engineered

</div>

| Category | Features | Count |
|:--------:|:---------|:-----:|
|  **Target** | `cpm25` (Chemical PM2.5) | 1 |
|  **Meteorological** | `q2` `t2` `pblh` `psfc` `swdown` `rain` | 6 |
|  **Wind** | `u10` `v10` | 2 |
|  **Emissions** | `PM25` `NOx` `SO2` `NH3` | 4 |
|  **Engineered** | `wind_speed` `hour_sin` `hour_cos` | 3 |

---

##  Results

<div align="center">

### Final Performance

| Metric | Value |
|:------:|:-----:|
|  **Kaggle Score** | **0.8825** |
|  Val Episode SMAPE | 0.1131 |
|  Val Episode Corr | 0.9865 |

### Output Statistics

| Property | Value |
|:--------:|:-----:|
|  Shape | `(218, 140, 124, 16)` |
|  Range | `[0.0, 6161.3]` µg/m³ |
|  Mean | `42.6` µg/m³ |
|  Pixels Corrected | 11.37% |

</div>

---

##  Requirements

```
torch >= 2.0
numpy >= 1.24
```

**Hardware:** NVIDIA Tesla T4 (16GB) or equivalent

---

##  License

<div align="center">

**ANRF Open License**

*AI-SE Hack 2026*

---

Made with  for cleaner air

</div>
