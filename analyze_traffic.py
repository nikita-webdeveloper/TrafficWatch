
import pandas as pd
from pathlib import Path

data_dir = Path(__file__).parent / "data"
file_path = data_dir / "traffic_cleaned.csv"

df = pd.read_csv(file_path)
df["timestamp"] = pd.to_datetime(df["timestamp"])

# Extract the hour from each reading
df["hour"] = df["timestamp"].dt.hour

print("\n--- Average Congestion by Area ---")
print(
    df.groupby("area")["congestion_percent"]
    .mean()
    .round(2)
    .sort_values(ascending=False)
)

print("\n--- Average Congestion by Hour ---")
print(
    df.groupby("hour")["congestion_percent"]
    .mean()
    .round(2)
)

print("\n--- Average Speed by Area (km/h) ---")
print(
    df.groupby("area")["current_speed_kmh"]
    .mean()
    .round(2)
)

print("\n--- Analysis Complete ---")


import matplotlib.pyplot as plt

area_congestion = (
    df.groupby("area")["congestion_percent"]
    .mean()
    .sort_values(ascending=False)
)

plt.figure(figsize=(8, 5))
area_congestion.plot(kind="bar")
plt.title("Average Traffic Congestion by Area")
plt.xlabel("Area")
plt.ylabel("Average Congestion (%)")
plt.xticks(rotation=20)
plt.tight_layout()

chart_path = data_dir / "congestion_by_area.png"
plt.savefig(chart_path, dpi=150)
print("Chart saved to:", chart_path)

plt.show()

import matplotlib.pyplot as plt

# Plot average congestion by area
area_congestion = (
    df.groupby("area")["congestion_percent"]
    .mean()
    .sort_values(ascending=False)
)

plt.figure(figsize=(8, 5))
area_congestion.plot(kind="bar")
plt.title("Average Traffic Congestion by Area")
plt.xlabel("Area")
plt.ylabel("Average Congestion (%)")
plt.xticks(rotation=20)
plt.tight_layout()
plt.savefig(data_dir / "congestion_by_area.png", dpi=150)
plt.show()

print("Chart saved to:", data_dir / "congestion_by_area.png")
