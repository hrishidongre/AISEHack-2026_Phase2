# Top Model - Score: 0.8834

**Best performing model in the competition**

## Configuration

| Parameter | Value |
|:----------|:------|
| Quantile | q=0.90 |
| Blend Weights | 20% Stable + 80% Spike |
| Curvature Divisor | d=800 |
| Epochs | 15 |
| Patience | 5 |
| Learning Rate | 1e-5 |

## Key Differences from Model 2

- Higher quantile (0.90 vs 0.85) - targets top 10% instead of top 15%
- More aggressive spike weighting (80% vs 70%)
- Stronger curvature correction (d=800 vs d=1000)

## Files

- `greeshma.ipynb` - Full training and inference notebook

## Output Statistics

- Final range: [0.0, 12608.7] ug/m3
- Mean: 44.6 ug/m3
- Pixels corrected: 11.92%

## Checkpoints

Model checkpoints are available on Kaggle:
- Stable Expert: `best_episodic_finetune.pt`
- Spike Expert (PQR): `best_pqr_finetune.pt`
