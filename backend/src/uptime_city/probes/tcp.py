import asyncio
import time
from datetime import UTC, datetime

from uptime_city.probes.base import ProbeResult


async def connect(host: str, port: int, timeout: float) -> ProbeResult:
    """Success means a TCP connection was established within `timeout` seconds."""
    timestamp = datetime.now(UTC)
    start = time.perf_counter()
    try:
        _, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout)
    except TimeoutError:
        return ProbeResult(ts=timestamp, success=False, error=f"timeout after {timeout:g}s")
    except OSError as exception:  # refused, unreachable, DNS failure (socket.gaierror)
        return ProbeResult(
            ts=timestamp, success=False, error=str(exception) or type(exception).__name__
        )
    latency_ms = (time.perf_counter() - start) * 1000
    writer.close()
    try:
        await writer.wait_closed()
    except OSError:
        pass
    return ProbeResult(ts=timestamp, success=True, latency_ms=latency_ms)
