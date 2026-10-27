from datetime import UTC, datetime, timedelta

from uptime_city.probes.base import ProbeResult

NOW = datetime(2026, 1, 31, 12, 0, tzinfo=UTC)


def result(minutes_ago: int, success: bool = True, error: str | None = None) -> ProbeResult:
    return ProbeResult(
        ts=NOW - timedelta(minutes=minutes_ago),
        success=success,
        latency_ms=None if error else 3.5,
        error=error,
        host_down=error == "host is down",
    )
