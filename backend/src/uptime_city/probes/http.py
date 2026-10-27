import time
from datetime import UTC, datetime

import httpx

from uptime_city.conditions.evaluate import evaluate_condition
from uptime_city.config.models import Endpoint
from uptime_city.probes.base import ProbeResult


async def probe_http(endpoint: Endpoint) -> ProbeResult:
    timestamp = datetime.now(UTC)
    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(
            timeout=endpoint.client.timeout.total_seconds(),
            verify=not endpoint.client.insecure,
        ) as client:
            response = await client.request(
                endpoint.method, endpoint.url, headers=endpoint.headers, content=endpoint.body
            )
    except (httpx.HTTPError, httpx.InvalidURL) as exception:
        return ProbeResult(
            ts=timestamp, success=False, error=f"{type(exception).__name__}: {exception}"
        )
    latency_ms = (time.perf_counter() - start) * 1000

    values = {"STATUS": response.status_code, "RESPONSE_TIME": latency_ms}
    errors: list[str] = []
    for condition in endpoint.conditions:
        try:
            if not evaluate_condition(condition, values):
                errors.append(f"condition failed: {condition} (status={response.status_code})")
        except ValueError as exception:
            errors.append(str(exception))
    return ProbeResult(
        ts=timestamp, success=not errors, latency_ms=latency_ms, error="; ".join(errors) or None
    )
