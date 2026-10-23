from collections.abc import Awaitable, Callable
from datetime import datetime

from pydantic import BaseModel


class ProbeResult(BaseModel):
    ts: datetime
    success: bool
    latency_ms: float | None = None
    error: str | None = None
    host_down: bool = False
    """The check was skipped because the endpoint's host is down."""


Probe = Callable[[str, float], Awaitable[ProbeResult]]
"""Checks `hostname` within `timeout` seconds."""
