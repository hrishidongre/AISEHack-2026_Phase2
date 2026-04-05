<div align="center", fontsize = 25> 
  # PM2.5 Pollution Forecasting 
</div>

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
                    INPUT
     (Batch, 16 channels, 10 hours, 140, 124)
                      |
     =================|=================
     |            ENCODER              |
     |                                 |
     |  +----------+  +----------+  +----------+
     |  | ConvBlock|->| ConvBlock|->| ConvBlock|
     |  |   64ch   |  |  128ch   |  |  256ch   |
     |  +----+-----+  +----+-----+  +----+-----+
     |       |e0           |e1           |e2
     |       |             |             |
     |  [MaxPool2d]   [MaxPool2d]   [AvgPool2d]
     |   140x124       70x62         35x31
     =================|=================
                      |
     =================|=================
     |           BOTTLENECK            |
     |                                 |
     |      +-------------------+      |
     |      |     ConvBlock     |      |
     |      |      256ch        |      |
     |      +---------+---------+      |
     |                |                |
     |      +---------v---------+      |
     |      |      ConvGRU      |<--+  |
     |      |    256 hidden     |   |  |
     |      +---------+---------+   |  |
     |                |             |  |
     |                +--[x16 autoregressive steps]
     |                                 |
     =================|=================
                      |
     =================|=================
     |            DECODER              |
     |         (U-Net style)           |
     |                                 |
     |  +----------+  +----------+  +----------+
     |  | ConvBlock|<-| ConvBlock|<-| ConvBlock|
     |  |   32ch   |  |   64ch   |  |  128ch   |
     |  +----+-----+  +----+-----+  +----+-----+
     |       ^             ^             ^
     |       |             |             |
     |       +----[skip e0]+---[skip e1]-+--[skip e2]
     |                                 |
     =================|=================
                      |
                  OUTPUT HEAD
                      |
                      v
                   OUTPUT
        (Batch, 16 hours, 140, 124)
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
                      Test Input
                    (218 samples)
                          |
          +---------------+---------------+
          |                               |
          v                               v
   +--------------+                +--------------+
   |    STABLE    |                |    SPIKE     |
   |    EXPERT    |                |    EXPERT    |
   |   (Phase 2)  |                |    (PQR)     |
   | Score: 0.8768|                |  Quantile-   |
   | Global focus |                |   trained    |
   +--------------+                +--------------+
          |                               |
          | x weight_stable               | x weight_spike
          |                               |
          +---------------+---------------+
                          |
                          v
                   +--------------+
                   |    BLEND     |
                   +--------------+
                          |
                          v
                   +--------------+
                   |  CURVATURE   |
                   |  CORRECTION  |
                   | (peaks >100) |
                   +--------------+
                          |
                          v
                    Final Output
```

### Model Configurations

| Model | Quantile | Blend Weights | Curvature | Score |
|:------|:--------:|:-------------:|:---------:|:-----:|
| **Top Model** | q=0.90 | 20% Stable + 80% Spike | 1+(p/800)^2 | **0.8834** |
| Model 2 | q=0.85 | 30% Stable + 70% Spike | 1+(p/1000)^2 | 0.8825 |

### Curvature Correction

Non-linear post-processing to boost extreme predictions:

```
For predictions > 100 ug/m3:
    stretch = 1 + (prediction / divisor)^2
    corrected = prediction x stretch
```

| Prediction | Top Model (d=800) | Model 2 (d=1000) |
|:----------:|:-----------------:|:----------------:|
| 100 ug/m3  | x1.016 (+1.6%)    | x1.010 (+1.0%)   |
| 300 ug/m3  | x1.141 (+14.1%)   | x1.090 (+9.0%)   |
| 500 ug/m3  | x1.391 (+39.1%)   | x1.250 (+25.0%)  |
| 800 ug/m3  | x2.000 (+100%)    | x1.640 (+64.0%)  |

---

## Results

### Final Leaderboard Performance

<div align="center">

| Metric | Top Model | Model 2 |
|:------:|:---------:|:-------:|
| **Kaggle Score** | **0.8834** | 0.8825 |
| Val Episode SMAPE | 0.1296 | 0.1131 |
| Val Episode Corr | 0.9856 | 0.9865 |

</div>

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
+-- README.md                        # This file
+-- EXECUTIVE_SUMMARY.md             # 2-page technical report
+-- LICENSE                          # ANRF Open License
|
+-- greeshma.ipynb                   # Top model (Score: 0.8834)
|   +-- Quantile: 0.90
|   +-- Blend: 20% Stable + 80% Spike
|   +-- Curvature: 1 + (p/800)^2
|
+-- PM25_MasterBlend_Documented.ipynb  # Model 2 (Score: 0.8825)
    +-- Quantile: 0.85
    +-- Blend: 30% Stable + 70% Spike
    +-- Curvature: 1 + (p/1000)^2
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

<div align="center">

---

**Team Code4CleanAir**  
ANRF AI-SE Hack Phase 2 - Theme 2  
April 2026

</div>
