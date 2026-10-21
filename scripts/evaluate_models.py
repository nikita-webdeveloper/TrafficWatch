import math
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, HistGradientBoostingRegressor
from sklearn.linear_model import Ridge, Lasso, ElasticNet, RidgeCV
from sklearn.metrics import mean_absolute_error, root_mean_squared_error

from ml.data_prep import (
    load_dataset,
    construct_prediction_pairs,
    FEATURE_COLUMNS,
    chronological_train_test_split,
)

def compute_robust_mape(y_true, y_pred):
    y_t = np.asarray(y_true, dtype=float)
    y_p = np.asarray(y_pred, dtype=float)
    denom = np.maximum(y_t, 5.0)
    return round(float(np.mean(np.abs(y_t - y_p) / denom) * 100.0), 2)

df = load_dataset()

# Evaluate for each horizon: 15, 30, 60
for h in [15, 30, 60]:
    print(f"\n=================== HORIZON {h}m ===================")
    pairs = construct_prediction_pairs(df, horizon_minutes=h)
    
    # Chronological 3-way split: 60% train, 20% validation, 20% test
    # First split off test (20%)
    train_val_df, test_df = chronological_train_test_split(pairs, test_ratio=0.20)
    # Then split train_val into train (75%) and val (25%) -> 60% / 20% overall
    train_df, val_df = chronological_train_test_split(train_val_df, test_ratio=0.25)
    
    print(f"Total pairs: {len(pairs)} | Train: {len(train_df)}, Val: {len(val_df)}, Test: {len(test_df)}")
    
    X_train = train_df[FEATURE_COLUMNS]
    y_train_delta = train_df["target_congestion"] - train_df["current_congestion_percent"]
    y_train_target = train_df["target_congestion"].values
    
    X_val = val_df[FEATURE_COLUMNS]
    y_val_target = val_df["target_congestion"].values
    val_cur_cong = val_df["current_congestion_percent"].values
    
    X_test = test_df[FEATURE_COLUMNS]
    y_test_target = test_df["target_congestion"].values
    test_cur_cong = test_df["current_congestion_percent"].values
    
    # Let's inspect true delta stats
    print(f"Train Delta mean: {y_train_delta.mean():.3f}, std: {y_train_delta.std():.3f}, median: {y_train_delta.median():.3f}")
    val_delta = y_val_target - val_cur_cong
    print(f"Val Delta mean: {val_delta.mean():.3f}, std: {val_delta.std():.3f}, median: {np.median(val_delta):.3f}")
    test_delta = y_test_target - test_cur_cong
    print(f"Test Delta mean: {test_delta.mean():.3f}, std: {test_delta.std():.3f}, median: {np.median(test_delta):.3f}")

    models = {}
    
    # 1. Persistence
    models["Persistence"] = lambda X, cur: cur
    
    # 2. Historical Average
    hist_map = train_df.groupby(["area", "hour"])["target_congestion"].mean().to_dict()
    global_mean = float(train_df["target_congestion"].mean())
    def hist_predict(df_sub):
        return df_sub.apply(lambda r: hist_map.get((r["area"], r["hour"]), global_mean), axis=1).values
    models["HistoricalAvg"] = lambda X, cur, df_sub=None: hist_predict(df_sub)
    
    # 3. Existing RF
    rf_exist = RandomForestRegressor(n_estimators=100, max_depth=6, min_samples_split=4, min_samples_leaf=3, random_state=42)
    rf_exist.fit(X_train, y_train_delta)
    models["Existing_RF"] = lambda X, cur: np.clip(cur + rf_exist.predict(X), 0.0, 100.0)
    
    # 4. Tuned RF (shallower, more regularized)
    rf_tuned = RandomForestRegressor(n_estimators=150, max_depth=4, min_samples_leaf=10, min_samples_split=10, random_state=42)
    rf_tuned.fit(X_train, y_train_delta)
    models["Tuned_RF"] = lambda X, cur: np.clip(cur + rf_tuned.predict(X), 0.0, 100.0)
    
    # 5. Ridge Regression
    ridge = RidgeCV(alphas=np.logspace(-2, 4, 20))
    ridge.fit(X_train, y_train_delta)
    models["Ridge"] = lambda X, cur: np.clip(cur + ridge.predict(X), 0.0, 100.0)
    
    # 6. HistGradientBoostingRegressor
    hgb = HistGradientBoostingRegressor(max_iter=50, max_depth=3, min_samples_leaf=15, l2_regularization=5.0, random_state=42)
    hgb.fit(X_train, y_train_delta)
    models["HistGradientBoosting"] = lambda X, cur: np.clip(cur + hgb.predict(X), 0.0, 100.0)

    # 7. Damped Ridge: shrink delta towards 0 by factor alpha
    for damp in [0.2, 0.5, 0.8]:
        models[f"Ridge_Damped_{damp}"] = (lambda d: lambda X, cur: np.clip(cur + d * ridge.predict(X), 0.0, 100.0))(damp)
        models[f"RF_Damped_{damp}"] = (lambda d: lambda X, cur: np.clip(cur + d * rf_tuned.predict(X), 0.0, 100.0))(damp)

    print("\n--- VALIDATION SET RESULTS ---")
    val_results = []
    for name, pred_fn in models.items():
        if name == "HistoricalAvg":
            preds = pred_fn(X_val, val_cur_cong, df_sub=val_df)
        else:
            preds = pred_fn(X_val, val_cur_cong)
        mae = mean_absolute_error(y_val_target, preds)
        rmse = root_mean_squared_error(y_val_target, preds)
        val_results.append((name, mae, rmse))
        print(f"  {name:25s} | MAE: {mae:.3f}% | RMSE: {rmse:.3f}%")

    # Sort by MAE
    val_results.sort(key=lambda x: x[1])
    best_val_name = val_results[0][0]
    print(f"  --> Best on Validation (MAE): {best_val_name}")

    print("\n--- TEST SET RESULTS (Final Unbiased Evaluation) ---")
    for name, pred_fn in models.items():
        if name == "HistoricalAvg":
            preds = pred_fn(X_test, test_cur_cong, df_sub=test_df)
        else:
            preds = pred_fn(X_test, test_cur_cong)
        mae = mean_absolute_error(y_test_target, preds)
        rmse = root_mean_squared_error(y_test_target, preds)
        mape = compute_robust_mape(y_test_target, preds)
        marker = " <--- BEST VAL" if name == best_val_name else ""
        print(f"  {name:25s} | MAE: {mae:.3f}% | RMSE: {rmse:.3f}% | MAPE: {mape:.2f}%{marker}")
