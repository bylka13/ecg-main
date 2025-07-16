from __future__ import annotations
from datetime import datetime, date
import numbers
import numpy as np


def parse_date_flex(value: str) -> date:
    """Parses either ISO (yyyy-mm-dd) or French (dd-mm-yyyy) date strings."""
    for fmt in ("%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Format de date non reconnu : {value}")

def sanitize(obj):
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    if isinstance(obj, np.ndarray):
        return sanitize(obj.tolist())
    if hasattr(obj, "tolist"): 
        return sanitize(obj.tolist())
    if isinstance(obj, numbers.Number): 
        return obj
    return obj