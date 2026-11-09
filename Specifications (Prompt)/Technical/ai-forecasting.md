# AI Harvest Forecasting

## Objective

Forecast harvest quantity and timing to prevent over-reservation and support procurement planning.

## Inputs / outputs

Input: fruit type/variety, area, tree count/age, historical yield, season, weather/rainfall/temperature, farm observations

Output: `p50_quantity`, a prediction interval such as p10–p90, harvest window, model version, data freshness, and confidence

## Algorithm

Start with a baseline of yield-per-area/tree + seasonal factors; once data is available, use Gradient Boosting/Random Forest or quantile regression, evaluating MAE, interval coverage, and calibration per fruit/season

`POST /api/ai/harvest-forecast` accepts farm/product/target window

## Rules

- A forecast is expected supply, not guaranteed supply
- Reservations use a safety buffer, and the actual quantity is confirmed before dispatch
- Missing weather/data shows higher uncertainty; never silently fill in made-up values

## Acceptance criteria

The system returns an uncertainty range, logs the input snapshot, runs time-split backtests, and never creates a confirmed contract from a forecast alone.
