# GenAI Workflow & Prompt Engineering Log
**Project:** IndiaCleanAir: High-Fidelity Spatiotemporal Forecasting of PM2.5 Extremes

This document details the Chain of Thought (CoT) and the specific, expert-level prompts used to collaborate with GenAI assistants (Claude 3.5 Sonnet / Gemini 1.5 Pro) during the architectural design, loss function formulation, and final regime-shift calibration phases of the project.

The overarching AI collaboration strategy was **Domain-Constrained Guided Generation**. Rather than asking open-ended coding questions, the GenAI was provided with specific mathematical formulations, memory constraints (Kaggle T4 16GB VRAM), and atmospheric physics priors to generate surgical PyTorch implementations.

---

## Phase 1: Architectural Exploration (Solving the Locality vs. Advection Tradeoff)
**Objective:** Replace standard feed-forward U-Nets (which suffer from temporal fading) with an architecture capable of modeling the advection-diffusion PDE.

**Chain of Thought:** Initial tests with Fourier Neural Operators (FNOs) revealed severe spectral bias—the global convolutions acted as low-pass filters, completely blurring out the high-frequency $500+ \mu g/m^3$ localized spikes. The hypothesis was to fuse the spatial locality of a U-Net with the temporal momentum tracking of a ConvGRU.

**Prompt to GenAI:**
> *"Implement a PyTorch `ResGRU-UNet` architecture for a 16-hour spatiotemporal PM2.5 forecast. The spatial encoder must be a 3-level Residual U-Net (channels: 64, 128, 256) using GroupNorm and GELU to prevent checkerboard artifacts. Crucially, replace the standard U-Net bottleneck with a `ConvGRUCell` operating on the latent space. The goal is to allow the ConvGRU to approximate the material derivative ($\frac{DC}{Dt}$) for plume advection, while the U-Net skip connections preserve the high-frequency spatial gradients required for localized episodes. Ensure the forward pass handles a sliding window of (B, C, T_in=10, H=140, W=124) and outputs (B, T_out=16, H, W) as a residual delta from the last observed log-space frame."*

---

## Phase 2: Metric Exploitation & Asymmetric Loss Formulation
**Objective:** Overcome the "persistence trap" of standard MSE/Huber losses, which severely penalize the variance required to predict extreme winter inversions.

**Chain of Thought:** The competition evaluation metric is SMAPE, which inherently possesses an asymmetric penalty bias—under-predicting a true peak of $1000$ yields a larger penalty than over-predicting a background value. To exploit this, we needed a custom loss function that mathematically forces the network's gradient pressure onto the extreme tail of the log-normal distribution.

**Prompt to GenAI:**
> *"Draft a custom PyTorch loss module `EpisodeWeightedHuberLoss`. Standard Huber loss is trapping our model in a local minimum where it predicts the seasonal mean. I need a hybrid loss operating in $log(1+C)$ space: combine $40\%$ SmoothL1 Loss (for base stability) with $60\%$ Asymmetric Pinball Loss targeting the $q=0.85$ quantile. This must penalize under-prediction 5.67x more than over-prediction. Additionally, implement an episode-masking mechanism calculated dynamically from the context window (target > baseline mean + 2$\sigma$), and output raw-space Episode Correlation metrics during the `no_grad()` monitoring block so we can track spatial plume integrity independently of magnitude error."*

---

## Phase 3: Regime-Shift Calibration & Physics Gating
**Objective:** Correct the degradation in Global SMAPE caused by applying a flat $1.12\times$ multiplier across the entire grid (which inflated background noise).

**Chain of Thought:** A global multiplier assumes linear error distribution, which is meteorologically false. Spikes only occur under specific atmospheric conditions (stagnation). We need to extract the physical parameters (Wind Divergence and Ventilation) from the test input to create a "Physics Gate," ensuring we only amplify predictions where the air is physically stagnant.

**Prompt to GenAI:**
> *"Refactor the post-processing inference loop. Our global $1.12\times$ intensity multiplier degraded the Global SMAPE to 0.8738 due to background noise inflation on the $90\%$ of pixels representing clean air. Implement a vectorized `compute_physics_multiplier` function using numpy. Calculate the Ventilation Index ($WS \times PBLH$) and Wind Divergence ($\nabla \cdot \mathbf{u}$) via `np.gradient` on the final $u10/v10$ input frames. Construct a boolean 'Stagnation Gate': if ventilation is below the grid mean AND divergence is negative (converging air), apply a $1.35\times$ stretch factor. For all other pixels, apply a $1.0\times$ identity. Finally, integrate a Power-Law Temporal Ramp $(1 + \alpha)^t$ with $\alpha=0.008$ to counteract the natural intensity decay of the ConvGRU hidden state over the 16-hour rollout."*

---

## Phase 4: OOM-Safe Master Blend Inference
**Objective:** Blend a conservative Huber-trained model with an aggressive Pinball-trained model within the strict 16GB VRAM limits of the Kaggle T4 GPU.

**Chain of Thought:** A single model trained purely on $q=0.90$ Pinball loss hallucinates plumes (high False Positive rate). A Huber model is too conservative (high False Negative rate). We must perform a weighted ensemble of both weights ($0.2$ Stable / $0.8$ Spike), but loading both models and processing the 218 test samples simultaneously will trigger a CUDA Out-Of-Memory (OOM) error.

**Prompt to GenAI:**
> *"Write an OOM-safe, sequential ensembling script for the Kaggle submission. We have two state_dicts: `stable_expert.pt` and `spike_expert.pt`. Due to the T4's 16GB VRAM limit, you must: \n1. Load the stable model, run `autocast` FP16 inference in batches of 4, save the raw predictions to a pre-allocated numpy memmap array, then `del model` and `torch.cuda.empty_cache()`.\n2. Repeat the process for the spike expert.\n3. Perform a CPU-side matrix blend: $0.2 \times \text{Stable} + 0.8 \times \text{Spike}$.\n4. Apply a Non-Linear Curvature Correction `stretch = 1.0 + (preds/800)^2` strictly to values $> 100 \mu g/m^3$, clamping the final output to 6000.0 to maximally exploit the SMAPE bravery bias on the extreme 2017 test episodes. Ensure exact shape formatting `(218, 140, 124, 16)` for the final `preds.npy`."*

---
**Summary of AI Utility:**
The GenAI tools were not utilized to generate the overall scientific strategy or the problem formulation. Rather, they functioned as **high-speed syntax compilers and mathematical translators**, rapidly converting our meteorological hypotheses and custom metric-exploitation mathematics into highly optimized, CUDA-compliant PyTorch tensors.
