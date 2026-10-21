import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
from sklearn.linear_model import RidgeCV
from sklearn.metrics import mean_absolute_error, root_mean_squared_error

from ml.data_prep import (
    load_dataset,
    construct_prediction_pairs,
    FEATURE_COLUMNS,
    chronological_train_test_split,
)

df = load_dataset()

for h in [15, 30, 60]:
    pairs = construct_prediction_pairs(df, horizon_minutes=h)
    train_df, test_df = chronological_train_test_split(pairs, test_ratio=0.25)
    
    X_train = train_df[FEATURE_COLUMNS]
    y_train_delta = train_df["target_congestion"] - train_df["current_congestion_percent"]
    
    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df["target_congestion"].values
    test_cur = test_df["current_congestion_percent"].values
    
    # 1. Persistence
    p_pred = test_cur
    p_mae = mean_absolute_error(y_test, p_pred)
    p_rmse = root_mean_squared_error(y_test, p_pred)
    
    # 2. Historical Avg
    hist_map = train_df.groupby(["area", "hour"])["target_congestion"].mean().to_dict()
    g_mean = float(train_df["target_congestion"].mean())
    h_pred = test_df.apply(lambda r: hist_map.get((r["area"], r["hour"]), g_mean), axis=1).values
    h_mae = mean_absolute_error(y_test, h_pred)
    h_rmse = root_mean_squared_error(y_test, h_pred)
    
    # 3. Existing RF
    rf = RandomForestRegressor(n_estimators=100, max_depth=6, min_samples_split=4, min_samples_leaf=3, random_state=42)
    rf.fit(X_train, y_train_delta)
    rf_pred = np.clip(test_cur + rf.predict(X_test), 0.0, 100.0)
    rf_mae = mean_absolute_error(y_test, rf_pred)
    rf_rmse = root_mean_squared_error(y_test, rf_pred)
    
    # 4. HistGradientBoosting
    hgb = HistGradientBoostingRegressor(max_iter=60, max_depth=4, min_samples_leaf=15, l2_regularization=10.0, random_state=42)
    hgb.fit(X_train, y_train_delta)
    hgb_pred = np.clip(test_cur + hgb.predict(X_test), 0.0, 100.0)
    hgb_mae = mean_absolute_error(y_test, hgb_pred)
    hgb_rmse = root_mean_squared_error(y_test, hgb_pred)
    
    # 5. Ridge
    ridge = RidgeCV()
    ridge.fit(X_train, y_train_delta)
    ridge_pred = np.clip(test_cur + ridge.predict(X_test), 0.0, 100.0)
    ridge_mae = mean_absolute_error(y_test, ridge_pred)
    ridge_rmse = root_mean_squared_error(y_test, ridge_pred)
    
    # 6. Ensemble / Damped: Adaptive Shrinkage
    # If ML predicts delta, shrink delta by factor based on correlation or validation
    # Let's test alpha from 0.0 (pure persistence) to 1.0 (pure ML)
    print(f"\n=================== HORIZON {h}m (Train: {len(train_df)}, Test: {len(test_df)}) ===================")
    print(f"  Persistence:           MAE = {p_mae:.3f}%, RMSE = {p_rmse:.3f}%")
    print(f"  Historical Avg:        MAE = {h_mae:.3f}%, RMSE = {h_rmse:.3f}%")
    print(f"  Random Forest:         MAE = {rf_mae:.3f}%, RMSE = {rf_rmse:.3f}%")
    print(f"  HistGradientBoosting:  MAE = {hgb_mae:.3f}%, RMSE = {hgb_rmse:.3f}%")
    print(f"  Ridge:                 MAE = {ridge_mae:.3f}%, RMSE = {ridge_rmse:.3f}%")
    
    # Also evaluate per-corridor for corridors with >= 20 test points
    print("  -- Per Corridor (Test count >= 15) --")
    test_df_copy = test_df.copy()
    test_df_copy["y_test"] = y_test
    test_df_copy["p_pred"] = p_pred
    test_df_copy["rf_pred"] = rf_pred
    test_df_copy["hgb_pred"] = hgb_pred
    for area, grp in test_df_copy.groupby("area"):
        if len(grp) >= 15:
            area_p_mae = mean_absolute_error(grp["y_test"], grp["p_pred"])
            area_rf_mae = mean_absolute_error(grp["y_test"], grp["rf_pred"])
            area_hgb_mae = mean_absolute_error(grp["y_test"], grp["hgb_pred"])
            print(f"    {area:30s} (N={len(grp):2d}): Persist MAE={area_p_mae:.2f}% | RF MAE={area_rf_mae:.2f}% | HGB MAE={area_hgb_mae:.2f}%")
