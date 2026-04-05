<h1 align="center"> 
   PM2.5 Pollution Forecasting 
</h1>


<div align="center">

**Episode-Aware Air Quality Prediction using Dual-Expert Ensemble**

[![Competition](https://img.shields.io/badge/ANRF_AI--SE_Hack-Phase_2-4361ee?style=for-the-badge)](https://anrfonline.in)
[![Best Score](https://img.shields.io/badge/Best_Score-0.8834-06d6a0?style=for-the-badge)](https://kaggle.com)
[![Theme](https://img.shields.io/badge/Theme_2-Pollution_Forecasting-ff6b6b?style=for-the-badge)](https://kaggle.com)

---

*Forecasting 16 hours of PM2.5 concentrations from 10 hours of meteorological data*  
*with emphasis on extreme pollution episodes*

**Team Code4CleanAir**

</div>

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Our Approach](#our-approach)
- [Model Architecture](#model-architecture)
- [Training Strategy](#training-strategy)
- [Inference Pipeline](#inference-pipeline)
- [Results](#results)
- [Repository Structure](#repository-structure)
- [License](#license)

---

## Problem Statement

Predict PM2.5 concentrations for the next **16 hours** given **10 hours** of historical meteorological and emissions data over a **140x124 spatial grid** (WRF-Chem domain over Delhi-NCR region).

**Key Challenge:** Accurately capture **episodic events** - sudden pollution spikes that are critical for public health warnings but inherently difficult to predict due to their extreme and rare nature.

**Evaluation Metric:** Episode-weighted SMAPE focusing on extreme pollution events.

---

## Our Approach

We developed a **multi-phase progressive training pipeline** with a dual-expert ensemble:

```
Phase 1: Base Training        -->  Global patterns learned
Phase 2: Episodic Fine-tuning -->  "Stable Expert" (0.8768)
Phase 3: Quantile Refinement  -->  Upper-percentile targeting
Phase 4: Pure Quantile (PQR)  -->  "Spike Expert" for extremes
                                          |
                                          v
                              Master Blend Ensemble
                              (Stable + Spike experts)
                                          |
                                          v
                              Curvature Correction
                              (Non-linear peak boost)
```

**Core Insight:** Under-predicting extreme pollution is worse than over-predicting. We use asymmetric **Pinball Loss** to penalize under-predictions more heavily.

---

## Model Architecture

### ResGRU-UNet

A hybrid encoder-decoder architecture combining **U-Net** spatial processing with **ConvGRU** temporal dynamics.

```
+----------------------------------------------------------+
|                          INPUT                           |
|          (Batch, 16 channels, 10 hours, 140, 124)        |
+------------------------------+---------------------------+
                               |
                               v
+----------------------------------------------------------+
|                         ENCODER                          |
|                                                          |
|    [ConvBlock 64] --> [ConvBlock 128] --> [ConvBlock 256]|
|          |                  |                  |         |
|      MaxPool2d          MaxPool2d          AvgPool2d     |
|      140x124             70x62              35x31        |
|          |                  |                  |         |
|         e0                 e1                 e2         |
|   (skip connection)  (skip connection)  (skip connection)|
+------------------------------+---------------------------+
                               |
                               v
+----------------------------------------------------------+
|                       BOTTLENECK                         |
|                                                          |
|                     [ConvBlock 256]                      |
|                           |                              |
|                           v                              |
|                   +---------------+                      |
|                   |    ConvGRU    |----+                 |
|                   |  256 hidden   |    | x16 steps       |
|                   +---------------+<---+                 |
|                           |        (autoregressive)      |
+------------------------------+---------------------------+
                               |
                               v
+----------------------------------------------------------+
|                        DECODER                           |
|                     (U-Net style)                        |
|                                                          |
|    [ConvBlock 32] <-- [ConvBlock 64] <-- [ConvBlock 128] |
|          ^                  ^                  ^         |
|          |                  |                  |         |
|       +--+------------------+------------------+         |
|       |        Skip Connections from Encoder             |
|       |            (e0, e1, e2 features)                 |
+------------------------------+---------------------------+
                               |
                               v
+----------------------------------------------------------+
|                       OUTPUT HEAD                        |
|              Conv2d -> GroupNorm -> GELU -> Conv2d       |
+------------------------------+---------------------------+
                               |
                               v
+----------------------------------------------------------+
|                         OUTPUT                           |
|               (Batch, 16 hours, 140, 124)                |
+----------------------------------------------------------+
```

**Key Design Decisions:**

| Component | Choice | Rationale |
|:---------:|:-------|:----------|
| Encoder | 3-level ConvBlocks | Hierarchical spatial feature extraction |
| Pooling | MaxPool + AvgPool | Max for features, Avg for smooth transitions |
| Bottleneck | ConvGRU x16 | Autoregressive temporal modeling |
| Decoder | U-Net skip connections | Preserve fine-grained spatial details |
| Output | Residual prediction | `pred = last_frame + delta` for stability |
| Normalization | GroupNorm | Batch-size independent, stable training |
| Activation | GELU | Smooth gradients for regression |

---

## Training Strategy

### Progressive Fine-tuning Pipeline

| Phase | Objective | Loss Function | Key Params | Score |
|:-----:|:----------|:--------------|:-----------|:-----:|
| 1 | Base training | MSE + Huber | LR=1e-3 | - |
| 2 | Episode focus | Huber + Episode weighting | LR=1e-4 | 0.8768 |
| 3 | Quantile targeting | Huber + Pinball(q=0.85) | LR=1e-5 | 0.8803 |
| 4 | Pure quantile | 100% Pinball(q=0.85/0.90) | LR=1e-5 | Spike Expert |

### Pinball Loss - The Key Innovation

Standard losses (MSE, MAE) penalize over/under-predictions equally. For episode forecasting, **under-prediction is worse** - missing a pollution spike has serious health implications.

**Pinball Loss at quantile q:**
```
L(y, pred) = max(q * (y - pred), (q-1) * (y - pred))

For q = 0.85:
  Under-prediction penalty: 0.85 x |error|
  Over-prediction penalty:  0.15 x |error|
  Asymmetry ratio: 5.67x
  
For q = 0.90:
  Under-prediction penalty: 0.90 x |error|
  Over-prediction penalty:  0.10 x |error|
  Asymmetry ratio: 9.0x
```

This forces the model to **prefer over-prediction** for extreme values.

---

## Inference Pipeline

### Master Blend Ensemble

We combine two specialized models for robust predictions:

```
+----------------------------------------------------------+
|                       TEST INPUT                         |
|                      (218 samples)                       |
+---------------------------+------------------------------+
                            |
            +---------------+---------------+
            |                               |
            v                               v
+------------------------+     +------------------------+
|      STABLE EXPERT     |     |      SPIKE EXPERT      |
|       (Phase 2)        |     |        (PQR)           |
|                        |     |                        |
|   Score: 0.8768        |     |   Quantile-trained     |
|   Global accuracy      |     |   Episode-focused      |
+------------------------+     +------------------------+
            |                               |
            | x weight_stable               | x weight_spike
            |                               |
            +---------------+---------------+
                            |
                            v
+----------------------------------------------------------+
|                         BLEND                            |
|         final = weight_stable * S + weight_spike * P     |
+---------------------------+------------------------------+
                            |
                            v
+----------------------------------------------------------+
|                   CURVATURE CORRECTION                   |
|                                                          |
|   For predictions > 100 ug/m3:                           |
|       stretch = 1 + (prediction / divisor)^2             |
|       corrected = prediction x stretch                   |
+---------------------------+------------------------------+
                            |
                            v
+----------------------------------------------------------+
|                      FINAL OUTPUT                        |
|                  (218, 140, 124, 16)                     |
+----------------------------------------------------------+
```

### Model Configurations

| Model | Quantile | Blend Weights | Curvature Divisor | Score |
|:------|:--------:|:-------------:|:-----------------:|:-----:|
| **Top Model** | q=0.90 | 20% Stable + 80% Spike | d=800 | **0.8834** |
| Model 2 | q=0.85 | 30% Stable + 70% Spike | d=1000 | 0.8825 |

### Curvature Correction Effect

| Prediction | Top Model (d=800) | Model 2 (d=1000) |
|:----------:|:-----------------:|:----------------:|
| 100 ug/m3  | x1.016 (+1.6%)    | x1.010 (+1.0%)   |
| 300 ug/m3  | x1.141 (+14.1%)   | x1.090 (+9.0%)   |
| 500 ug/m3  | x1.391 (+39.1%)   | x1.250 (+25.0%)  |
| 800 ug/m3  | x2.000 (+100%)    | x1.640 (+64.0%)  |

---

## Results

### Final Leaderboard Performance

| Metric | Top Model | Model 2 |
|:------:|:---------:|:-------:|
| **Kaggle Score** | **0.8834** | 0.8825 |
| Val Episode SMAPE | 0.1296 | 0.1131 |
| Val Episode Corr | 0.9856 | 0.9865 |

### Output Statistics

| Property | Value |
|:--------:|:------|
| Shape | (218, 140, 124, 16) |
| Samples | 218 test windows |
| Grid | 140 x 124 spatial points |
| Horizon | 16 hours forecast |

---

## Repository Structure

```
Code4CleanAir/
|
+-- README.md                    # This file
+-- EXECUTIVE_SUMMARY.md         # 2-page technical report
+-- LICENSE                      # ANRF Open License
|
+-- models/
|   |
|   +-- top-model/               # Best model (Score: 0.8834)
|   |   +-- README.md            # Model configuration details
|   |   +-- greeshma.ipynb       # Training & inference notebook
|   |
|   +-- model-2/                 # Secondary model (Score: 0.8825)
|       +-- README.md            # Model configuration details
|       +-- PM25_MasterBlend_Documented.ipynb
|
+-- aisehack-theme-2/            # Competition dataset
```

---

## Input Features

**16 Channels = 13 Base + 3 Engineered**

| Category | Features | Description |
|:--------:|:---------|:------------|
| Target | `cpm25` | Chemical PM2.5 concentration |
| Meteorological | `q2`, `t2`, `pblh`, `psfc`, `swdown`, `rain` | Humidity, temp, boundary layer, pressure, radiation, precipitation |
| Wind | `u10`, `v10` | 10m wind components |
| Emissions | `PM25`, `NOx`, `SO2`, `NH3` | Pollutant sources |
| Engineered | `wind_speed`, `hour_sin`, `hour_cos` | Derived features |

---

## Requirements

```
torch >= 2.0
numpy >= 1.24
```

**Hardware:** NVIDIA Tesla T4 (16GB) or equivalent

---

## License

This work is released under the **ANRF Open License** as part of the AI-SE Hack 2026 competition.

---

**Team Code4CleanAir**  
ANRF AI-SE Hack Phase 2 - Theme 2  
April 2026
