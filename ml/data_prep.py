"""
TrafficWatch Machine Learning Data Preparation
Handles:
- Loading cleaned dataset (or triggering pipeline if not present).
- Temporal & cyclical feature extraction (hour, dow, sin/cos, is_weekend).
- Spatial grouping and lag/trend feature extraction strictly from prior observations.
- Construction of supervised (t_0 -> t_0 + h) pairs for 15m, 30m, and 60m horizons.
- Strict chronological train/test split with zero future-data leakage.
"""

import math
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional

import numpy as np
import pandas as pd

from services.data_pipeline import (
    CLEANED_CSV_FILE,
    RAW_CSV_FILE,
    clean_historical_dataset,
    create_location_key,
)

FEATURE_COLUMNS = [
    "current_congestion_percent",
    "current_speed_kmh",
    "free_flow_speed_kmh",
    "speed_ratio",
    "free_flow_gap",
    "hour",
    "dayofweek",
    "is_weekend",
    "sin_hour",
    "cos_hour",
    "sin_dow",
    "cos_dow",
    "prior_congestion",
    "prior_speed",
    "cong_trend",
    "speed_trend",
]

HORIZON_CONFIGS = {
    15: {"target_min": 15.0, "min_window": 10.0, "max_window": 25.0},
    30: {"target_min": 30.0, "min_window": 22.0, "max_window": 40.0},
    60: {"target_min": 60.0, "min_window": 45.0, "max_window": 80.0},
}


def load_dataset(csv_path: Optional[str | Path] = None) -> pd.DataFrame:
    """
    Safely loads the cleaned traffic dataset.
    If cleaned dataset does not exist, triggers idempotent pipeline on raw dataset.
    """
    target_path = Path(csv_path) if csv_path else CLEANED_CSV_FILE
    if not target_path.exists():
        if RAW_CSV_FILE.exists():
            clean_historical_dataset(RAW_CSV_FILE, CLEANED_CSV_FILE)
            target_path = CLEANED_CSV_FILE
        else:
            raise FileNotFoundError(f"Neither cleaned dataset nor raw dataset found: {target_path}")

    df = pd.read_csv(target_path)
    if df.empty:
        raise ValueError(f"Traffic dataset at {target_path} is empty.")

    required_cols = [
        "timestamp",
        "current_speed_kmh",
        "free_flow_speed_kmh",
        "congestion_percent",
    ]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns in dataset: {missing}")

    # Parse timestamps
    df["dt"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["dt", "current_speed_kmh", "free_flow_speed_kmh"])

    # Road / Area identity
    if "area" not in df.columns:
        df["area"] = "default_road"
    else:
        df["area"] = df["area"].fillna("Unknown")

    if "city" not in df.columns:
        df["city"] = "Unknown"
    else:
        df["city"] = df["city"].fillna("Unknown")

    # Numeric conversions
    for col in ["current_speed_kmh", "free_flow_speed_kmh", "congestion_percent"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Compute congestion_percent if missing or NaN
    mask_nan_cong = df["congestion_percent"].isna()
    if mask_nan_cong.any():
        df.loc[mask_nan_cong, "congestion_percent"] = (
            (1.0 - df.loc[mask_nan_cong, "current_speed_kmh"] / df.loc[mask_nan_cong, "free_flow_speed_kmh"].clip(lower=1.0)) * 100.0
        ).clip(0.0, 100.0).round(1)

    df = df.dropna(subset=["current_speed_kmh", "free_flow_speed_kmh", "congestion_percent"])
    df = df.sort_values("dt").reset_index(drop=True)
    return df


# Backwards compatibility alias
load_raw_dataset = load_dataset


def inspect_dataset_stats(df: pd.DataFrame) -> Dict[str, Any]:
    """Computes comprehensive summary statistics for the dataset."""
    total_rows = len(df)
    unique_timestamps = df["dt"].nunique()
    unique_roads = df["area"].nunique()
    earliest_ts = df["dt"].min().isoformat() if not df.empty else None
    latest_ts = df["dt"].max().isoformat() if not df.empty else None

    time_span_hours = (
        (df["dt"].max() - df["dt"].min()).total_seconds() / 3600.0
        if not df.empty
        else 0.0
    )

    road_counts = df["area"].value_counts().to_dict()
    roads_with_repeated = sum(1 for count in road_counts.values() if count >= 15)

    return {
        "total_rows": total_rows,
        "available_columns": list(df.columns),
        "unique_roads": unique_roads,
        "unique_timestamps": unique_timestamps,
        "earliest_timestamp": earliest_ts,
        "latest_timestamp": latest_ts,
        "time_span_hours": round(time_span_hours, 2),
        "road_counts": road_counts,
        "roads_with_repeated_observations": roads_with_repeated,
        "has_sufficient_history": total_rows >= 50 and roads_with_repeated >= 1,
    }


def construct_prediction_pairs(
    df: pd.DataFrame,
    horizon_minutes: int = 15,
    target_horizon_min: Optional[float] = None,
    min_horizon_min: Optional[float] = None,
    max_horizon_min: Optional[float] = None,
) -> pd.DataFrame:
    """
    Constructs supervised training examples with zero future-data leakage for a given horizon.
    For each observation at t_0 on a given road, searches for an observation
    on the SAME road in [t_0 + min_window, t_0 + max_window], selecting the one
    closest to target_min.

    Features strictly derive from t_0 or earlier observations (prior speed/congestion).
    Target is future observed congestion percentage and speed at t_0 + ~horizon.
    """
    if target_horizon_min is not None:
        horizon_minutes = int(round(target_horizon_min))

    if horizon_minutes not in HORIZON_CONFIGS:
        raise ValueError(f"Unsupported horizon: {horizon_minutes}. Supported: {list(HORIZON_CONFIGS.keys())}")

    cfg = HORIZON_CONFIGS[horizon_minutes]
    min_horizon_min = min_horizon_min if min_horizon_min is not None else cfg["min_window"]
    max_horizon_min = max_horizon_min if max_horizon_min is not None else cfg["max_window"]
    target_horizon_min = target_horizon_min if target_horizon_min is not None else cfg["target_min"]

    samples: List[Dict[str, Any]] = []

    # Group by spatial location or area to ensure strict road isolation
    for (city, area), group in df.groupby(["city", "area"]):
        group = group.sort_values("dt").reset_index(drop=True)
        n = len(group)
        if n < 2:
            continue

        for i in range(n):
            row_now = group.loc[i]
            t_now = row_now["dt"]

            # Target matching: strictly future observations between min and max horizon
            min_target_time = t_now + pd.Timedelta(minutes=min_horizon_min)
            max_target_time = t_now + pd.Timedelta(minutes=max_horizon_min)

            future_candidates = group[
                (group["dt"] >= min_target_time) & (group["dt"] <= max_target_time)
            ]

            if future_candidates.empty:
                continue

            # Pick the candidate closest to target horizon
            ideal_time = t_now + pd.Timedelta(minutes=target_horizon_min)
            best_idx = (future_candidates["dt"] - ideal_time).abs().idxmin()
            row_future = future_candidates.loc[best_idx]

            # Lookback for lag feature: strictly prior observations [t_now - 30m, t_now)
            prior_window = group[
                (group["dt"] >= t_now - pd.Timedelta(minutes=30))
                & (group["dt"] < t_now)
            ]
            if not prior_window.empty:
                prior_cong = float(prior_window.iloc[-1]["congestion_percent"])
                prior_speed = float(prior_window.iloc[-1]["current_speed_kmh"])
            else:
                prior_cong = float(row_now["congestion_percent"])
                prior_speed = float(row_now["current_speed_kmh"])

            cur_cong = float(row_now["congestion_percent"])
            cur_speed = float(row_now["current_speed_kmh"])
            ff_speed = float(row_now["free_flow_speed_kmh"])
            tar_cong = float(row_future["congestion_percent"])
            tar_speed = float(row_future["current_speed_kmh"])

            speed_ratio = round(cur_speed / max(ff_speed, 1.0), 4)
            free_flow_gap = round(ff_speed - cur_speed, 2)

            # Temporal features
            hour = t_now.hour
            dayofweek = t_now.dayofweek
            is_weekend = 1 if dayofweek in (5, 6) else 0
            sin_hour = math.sin(2 * math.pi * hour / 24.0)
            cos_hour = math.cos(2 * math.pi * hour / 24.0)
            sin_dow = math.sin(2 * math.pi * dayofweek / 7.0)
            cos_dow = math.cos(2 * math.pi * dayofweek / 7.0)
            cong_trend = round(cur_cong - prior_cong, 2)
            speed_trend = round(cur_speed - prior_speed, 2)
            actual_horizon_min = round((row_future["dt"] - t_now).total_seconds() / 60.0, 1)

            samples.append(
                {
                    "timestamp": t_now,
                    "target_timestamp": row_future["dt"],
                    "city": city,
                    "area": area,
                    "current_congestion_percent": cur_cong,
                    "current_speed_kmh": cur_speed,
                    "free_flow_speed_kmh": ff_speed,
                    "speed_ratio": speed_ratio,
                    "free_flow_gap": free_flow_gap,
                    "hour": hour,
                    "dayofweek": dayofweek,
                    "is_weekend": is_weekend,
                    "sin_hour": sin_hour,
                    "cos_hour": cos_hour,
                    "sin_dow": sin_dow,
                    "cos_dow": cos_dow,
                    "prior_congestion": prior_cong,
                    "prior_speed": prior_speed,
                    "cong_trend": cong_trend,
                    "speed_trend": speed_trend,
                    "actual_horizon_min": actual_horizon_min,
                    "target_congestion": tar_cong,
                    "target_speed": tar_speed,
                    # Backwards compatibility target column name for 15m
                    "target_speed_15m": tar_speed,
                }
            )

    if not samples:
        return pd.DataFrame()

    paired_df = pd.DataFrame(samples).sort_values("timestamp").reset_index(drop=True)
    return paired_df


def chronological_train_test_split(
    df: pd.DataFrame,
    test_ratio: float = 0.25,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Splits the paired dataset chronologically with an embargo boundary to strictly avoid
    any temporal or target-window data leakage across the train/test boundary.
    All train target timestamps strictly precede all test feature observation timestamps.
    """
    if df.empty:
        raise ValueError("Cannot split empty dataset.")

    df_sorted = df.sort_values("timestamp").reset_index(drop=True)
    split_idx = int(len(df_sorted) * (1.0 - test_ratio))
    split_idx = max(1, min(split_idx, len(df_sorted) - 1))

    split_t0 = df_sorted.loc[split_idx, "timestamp"]

    # Embargo boundary: drop train samples whose target extends into or past the test start
    train_candidate = df_sorted.iloc[:split_idx].copy()
    if "target_timestamp" in train_candidate.columns:
        train_df = train_candidate[train_candidate["target_timestamp"] <= split_t0].copy().reset_index(drop=True)
    else:
        train_df = train_candidate.reset_index(drop=True)

    if train_df.empty:
        train_df = train_candidate.reset_index(drop=True)

    test_df = df_sorted.iloc[split_idx:].copy().reset_index(drop=True)

    return train_df, test_df


def chronological_train_val_test_split(
    df: pd.DataFrame,
    val_ratio: float = 0.20,
    test_ratio: float = 0.20,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Splits the paired dataset chronologically into 3 distinct sets:
    - Train (e.g. 60%)
    - Validation (e.g. 20%, for model selection and hyperparameter tuning)
    - Held-Out Test (e.g. 20%, reserved strictly for final unbiased evaluation)
    Enforces embargo boundaries between train->val and val->test to ensure zero lookahead leakage.
    """
    if df.empty:
        raise ValueError("Cannot split empty dataset.")

    # 1. Split off test set
    train_val_df, test_df = chronological_train_test_split(df, test_ratio=test_ratio)

    # 2. Split train_val into train and val
    # Normalize val_ratio relative to the remaining train_val portion
    effective_val_ratio = val_ratio / max(0.01, 1.0 - test_ratio)
    effective_val_ratio = max(0.05, min(0.50, effective_val_ratio))
    train_df, val_df = chronological_train_test_split(train_val_df, test_ratio=effective_val_ratio)

    return train_df, val_df, test_df


