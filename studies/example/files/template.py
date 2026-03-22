"""Data Analysis Template — complete the functions below."""
import pandas as pd

def load_data(filepath: str) -> pd.DataFrame:
    # TODO: Implement
    pass

def summary_statistics(df: pd.DataFrame) -> dict:
    # TODO: return mean, median, std, min, max
    pass

if __name__ == "__main__":
    df = load_data("data.csv")
    print("Summary:", summary_statistics(df))
