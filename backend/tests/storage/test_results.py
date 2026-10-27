import asyncio
from datetime import timedelta
from pathlib import Path

from tests.storage.helpers import NOW, result
from uptime_city.config.models import StorageConfig
from uptime_city.probes.base import ProbeResult
from uptime_city.storage.database import Database


async def test_results_come_back_oldest_first_per_endpoint_limited() -> None:
    database = Database(StorageConfig(type="memory"))
    await database.init()
    for minutes_ago in (5, 1, 3):
        await database.results.add("a", result(minutes_ago))
    await database.results.add("b", result(2))

    kept = await database.results.recent("a", 2)
    assert [result.ts for result in kept] == [
        NOW - timedelta(minutes=3),
        NOW - timedelta(minutes=1),
    ]
    assert [result.ts for result in await database.results.recent("b", 50)] == [
        NOW - timedelta(minutes=2)
    ]
    assert await database.results.recent("none", 50) == []
    await database.close()


async def test_a_result_is_read_back_whole() -> None:
    database = Database(StorageConfig(type="memory"))
    await database.init()
    down = result(1, success=False, error="host is down")
    await database.results.add("a", down)

    assert await database.results.recent("a", 50) == [down]
    await database.close()


async def test_pruning_deletes_the_results_older_than_the_limit() -> None:
    database = Database(StorageConfig(type="memory"))
    await database.init()
    for minutes_ago in (90, 30, 10):
        await database.results.add("a", result(minutes_ago))

    deleted = await database.results.prune(NOW - timedelta(minutes=60))

    assert deleted == 1
    assert len(await database.results.recent("a", 50)) == 2
    await database.close()


async def test_results_survive_a_restart_with_sqlite(tmp_path: Path) -> None:
    config = StorageConfig(type="sqlite", path=str(tmp_path / "uptime.db"))
    first = Database(config)
    await first.init()
    await first.results.add("a", result(2))
    await first.close()

    second = Database(config)
    await second.init()
    assert await second.results.recent("a", 50) == [result(2)]
    await second.close()


async def test_fifty_concurrent_adds_lose_nothing(tmp_path: Path) -> None:
    database = Database(StorageConfig(type="sqlite", path=str(tmp_path / "uptime.db")))
    await database.init()

    await asyncio.gather(*(database.results.add("a", result(number)) for number in range(1, 51)))

    stored = await database.results.recent("a", 100)
    assert sorted(result.ts for result in stored) == sorted(
        result(number).ts for number in range(1, 51)
    )
    await database.close()


async def test_a_result_exactly_at_the_pruning_limit_is_kept() -> None:
    database = Database(StorageConfig(type="memory"))
    await database.init()
    for minutes_ago in (61, 60, 59):
        await database.results.add("a", result(minutes_ago))

    deleted = await database.results.prune(NOW - timedelta(minutes=60))

    assert deleted == 1
    kept = await database.results.recent("a", 50)
    assert [result.ts for result in kept] == [
        NOW - timedelta(minutes=60),
        NOW - timedelta(minutes=59),
    ]
    await database.close()


async def test_pruning_nothing_tells_zero() -> None:
    database = Database(StorageConfig(type="memory"))
    await database.init()
    await database.results.add("a", result(1))

    assert await database.results.prune(NOW - timedelta(days=1)) == 0
    await database.close()


async def test_a_limit_above_the_number_of_results_gives_them_all() -> None:
    database = Database(StorageConfig(type="memory"))
    await database.init()
    for minutes_ago in (3, 2):
        await database.results.add("a", result(minutes_ago))

    assert len(await database.results.recent("a", 1000)) == 2
    await database.close()


async def test_results_with_the_same_time_come_back_in_insertion_order() -> None:
    database = Database(StorageConfig(type="memory"))
    await database.init()
    same_time = [ProbeResult(ts=NOW, success=False, error=f"error {number}") for number in range(5)]
    for stored in same_time:
        await database.results.add("a", stored)

    assert await database.results.recent("a", 50) == same_time
    assert await database.results.recent("a", 2) == same_time[-2:]
    await database.close()
