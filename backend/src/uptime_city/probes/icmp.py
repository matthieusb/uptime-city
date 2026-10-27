# icmplib ships no type stubs
# pyright: reportMissingTypeStubs=false, reportUnknownVariableType=false, reportUnknownMemberType=false
from datetime import UTC, datetime

from icmplib import ICMPLibError, async_ping

from uptime_city.probes.base import ProbeResult


async def ping(hostname: str, timeout: float) -> ProbeResult:
    timestamp = datetime.now(UTC)
    try:
        host = await async_ping(hostname, count=1, timeout=max(1, round(timeout)), privileged=False)
    except ICMPLibError as exception:
        return ProbeResult(ts=timestamp, success=False, error=str(exception))
    if not host.is_alive:
        return ProbeResult(ts=timestamp, success=False, error="no reply")
    return ProbeResult(ts=timestamp, success=True, latency_ms=host.avg_rtt)
