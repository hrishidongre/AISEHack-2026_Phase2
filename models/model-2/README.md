# Model 2 - Score: 0.8825

**Secondary model with balanced configuration**

## Configuration

| Parameter | Value |
|:----------|:------|
| Quantile | q=0.85 |
| Blend Weights | 30% Stable + 70% Spike |
| Curvature Divisor | d=1000 |
| Epochs | 5 |
| Patience | 3 |
| Learning Rate | 1e-5 |

## Key Differences from Top Model

- Lower quantile (0.85 vs 0.90) - targets top 15% instead of top 10%
- More balanced blend (30/70 vs 20/80)
- Gentler curvature correction (d=1000 vs d=800)

## Files

- `PM25_MasterBlend_Documented.ipynb` - Fully documented training and inference notebook

## Output Statistics

- Final range: [0.0, 6161.3] ug/m3
- Mean: 42.6 ug/m3
- Pixels corrected: 11.37%

## Checkpoints

Model checkpoints are available on Kaggle:
- Stable Expert: `best_episodic_finetune.pt`
- Spike Expert (PQR): `best_pqr_finetune.pt`
