import time
from datetime import UTC, datetime

import httpx

from uptime_city.conditions.evaluate import evaluate_condition
from uptime_city.config.models import Endpoint
from uptime_city.probes.base import ProbeResult


async def probe_http(endpoint: Endpoint) -> ProbeResult:
    ts = datetime.now(UTC)
    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(
            timeout=endpoint.client.timeout.total_seconds(),
            verify=not endpoint.client.insecure,
        ) as client:
            response = await client.request(
                endpoint.method, endpoint.url, headers=endpoint.headers, content=endpoint.body
            )
    except httpx.HTTPError as exc:
        return ProbeResult(ts=ts, success=False, error=f"{type(exc).__name__}: {exc}")
    latency_ms = (time.perf_counter() - start) * 1000

    values = {"STATUS": response.status_code, "RESPONSE_TIME": latency_ms}
    errors: list[str] = []
    for condition in endpoint.conditions:
        try:
            if not evaluate_condition(condition, values):
                errors.append(f"condition failed: {condition} (status={response.status_code})")
        except ValueError as exc:
            errors.append(str(exc))
    return ProbeResult(
        ts=ts, success=not errors, latency_ms=latency_ms, error="; ".join(errors) or None
    )
