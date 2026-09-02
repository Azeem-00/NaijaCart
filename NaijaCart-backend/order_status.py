from datetime import datetime


def parse_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return None


def get_lifecycle_status(status, created_at):
    normalized = (status or "").strip().lower()
    if normalized in {"delivered", "completed", "fulfilled"}:
        return "delivered"
    if normalized in {"cancelled", "canceled", "failed", "rejected"}:
        return "cancelled"

    created = parse_datetime(created_at)
    if created is None:
        return "processing" if normalized in {"pending", "paid", "processing", "checkout", "checked_out"} else normalized or "processing"

    age_days = (datetime.utcnow() - created).total_seconds() / 86400
    if age_days >= 7:
        return "delivered"
    return "processing"


def get_status_label(status):
    status_map = {
        "pending": "Pending",
        "processing": "Processing",
        "delivered": "Delivered",
        "cancelled": "Cancelled",
    }
    return status_map.get((status or "").strip().lower(), "Processing")
