import pandas as pd
import numpy as np

def inspect():
    df = pd.read_csv('data/live_traffic.csv')
    print("=== DATASET INSPECTION REPORT ===")
    print(f"Total rows: {len(df)}")
    print(f"Columns: {list(df.columns)}")
    print(f"Null counts:\n{df.isnull().sum()}")
    print(f"Unique areas: {df['area'].nunique()}")
    print(f"Unique (lat, lon) pairs: {df.groupby(['latitude', 'longitude']).ngroups}")
    print(f"Unique timestamps: {df['timestamp'].nunique()}")

    df['dt'] = pd.to_datetime(df['timestamp'])
    print(f"Earliest timestamp: {df['dt'].min()}")
    print(f"Latest timestamp: {df['dt'].max()}")
    print(f"Total time span: {df['dt'].max() - df['dt'].min()}")

    print("\nBreakdown by Area / Road:")
    for area, group in df.groupby('area'):
        g_sorted = group.sort_values('dt')
        diffs = g_sorted['dt'].diff().dt.total_seconds() / 60
        median_step = diffs.median() if len(diffs) > 1 else np.nan
        print(f"  {area:30s} | Rows: {len(group):3d} | Median step: {median_step:5.1f} min | Time range: {g_sorted['dt'].min()} to {g_sorted['dt'].max()}")

if __name__ == '__main__':
    inspect()
