import asyncio
import logging
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest

from tests.monitor.helpers import (
    Probes,
    make_config,
    memory_database,
    running,
    until,
)
from uptime_city.monitor.scheduler import HISTORY_SIZE, PRUNE_EVERY_S, Monitor
from uptime_city.probes.base import ProbeResult


async def test_monitor_saves_every_result() -> None:
    async def probe(hostname: str, timeout: float) -> ProbeResult:
        return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=1.0)

    database = await memory_database()
    monitor = Monitor(make_config(), probe, database=database)
    task = asyncio.create_task(monitor.run())
    while len(monitor.history("srv")) < 3:
        await asyncio.sleep(0.01)
    task.cancel()

    assert len(await database.results.recent("srv", 50)) >= 3
    await database.close()


async def test_monitor_starts_with_the_results_of_the_last_run() -> None:
    database = await memory_database()
    old = ProbeResult(ts=datetime.now(UTC) - timedelta(hours=2), success=False, error="late")
    await database.results.add("srv", old)

    async def probe(hostname: str, timeout: float) -> ProbeResult:
        return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=1.0)

    monitor = Monitor(make_config(), probe, database=database)
    task = asyncio.create_task(monitor.run())
    while len(monitor.history("srv")) < 2:
        await asyncio.sleep(0.01)
    task.cancel()

    history = monitor.history("srv")
    assert history[0] == old
    assert history[1].success is True
    await database.close()


async def test_monitor_drops_the_results_older_than_the_retention() -> None:
    database = await memory_database()
    await database.results.add(
        "srv", ProbeResult(ts=datetime.now(UTC) - timedelta(days=31), success=True)
    )
    recent = ProbeResult(ts=datetime.now(UTC) - timedelta(days=29), success=True)
    await database.results.add("srv", recent)

    async def probe(hostname: str, timeout: float) -> ProbeResult:
        return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=1.0)

    monitor = Monitor(make_config(), probe, database=database)
    task = asyncio.create_task(monitor.run())
    while len(monitor.history("srv")) < 2:
        await asyncio.sleep(0.01)
    task.cancel()

    assert monitor.history("srv")[0] == recent
    stored = await database.results.recent("srv", 50)
    assert all(result.ts > datetime.now(UTC) - timedelta(days=30) for result in stored)
    await database.close()


async def test_a_failing_database_does_not_stop_the_monitoring() -> None:
    async def probe(hostname: str, timeout: float) -> ProbeResult:
        return ProbeResult(ts=datetime.now(UTC), success=True, latency_ms=1.0)

    # Once closed, a memory database comes back empty, without its tables: every query fails.
    broken = await memory_database()
    await broken.close()
    monitor = Monitor(make_config(), probe, database=broken)
    task = asyncio.create_task(monitor.run())
    while len(monitor.history("srv")) < 3:
        await asyncio.sleep(0.01)
    task.cancel()


async def test_the_prune_loop_runs_every_hour_and_survives_a_failing_prune(
    sleeps: list[float], caplog: pytest.LogCaptureFixture
) -> None:
    database = await memory_database()
    prune = AsyncMock(side_effect=[0, RuntimeError("disk full"), 0, 0])
    database.results.prune = prune  # one call at startup, then one per hour
    monitor = Monitor(make_config(), Probes(), database=database)
    with caplog.at_level(logging.ERROR, logger="uptime_city.monitor.scheduler"):
        async with running(monitor) as task:
            await until(lambda: prune.await_count >= 4)
            assert not task.done()
    assert sleeps.count(PRUNE_EVERY_S) >= 3
    assert "could not delete the results past the retention" in caplog.text
    await database.close()


async def test_a_failing_restore_is_logged_and_does_not_stop_the_monitor(
    sleeps: list[float], caplog: pytest.LogCaptureFixture
) -> None:
    broken = await memory_database()
    await broken.close()
    monitor = Monitor(make_config(), Probes(), database=broken)
    with caplog.at_level(logging.ERROR, logger="uptime_city.monitor.scheduler"):
        async with running(monitor) as task:
            await until(lambda: len(monitor.history("srv")) >= 3)
            assert not task.done()
    assert "could not restore the results of the last run" in caplog.text


async def test_only_the_last_50_stored_results_are_restored() -> None:
    database = await memory_database()
    now = datetime.now(UTC)
    stored = [
        ProbeResult(ts=now - timedelta(minutes=60 - number), success=True) for number in range(60)
    ]
    for stored_result in stored:
        await database.results.add("srv", stored_result)

    async def never_answers(hostname: str, timeout: float) -> ProbeResult:
        await asyncio.Event().wait()
        raise AssertionError

    monitor = Monitor(make_config(), never_answers, database=database)
    async with running(monitor):
        await until(lambda: len(monitor.history("srv")) > 0)
    assert HISTORY_SIZE == 50
    assert monitor.history("srv") == stored[-HISTORY_SIZE:]
    await database.close()
