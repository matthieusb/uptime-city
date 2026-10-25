import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from pydantic import ValidationError

from uptime_city.config.models import StorageConfig, parse_duration
from uptime_city.probes.base import ProbeResult
from uptime_city.storage.database import Database
from uptime_city.storage.engine import database_url


def test_storage_defaults_to_sqlite_in_the_data_folder() -> None:
    config = StorageConfig()
    assert config.type == "sqlite"
    assert config.path == "data/uptime.db"


def test_storage_rejects_an_unknown_type() -> None:
    with pytest.raises(ValidationError):
        StorageConfig.model_validate({"type": "mysql"})


def test_database_url_per_type() -> None:
    assert database_url(StorageConfig(type="sqlite", path="x/u.db")) == "sqlite+aiosqlite:///x/u.db"
    assert database_url(StorageConfig(type="memory")) == "sqlite+aiosqlite://"
    assert (
        database_url(StorageConfig(type="postgres", path="postgres://u:p@db/uc"))
        == "postgresql+asyncpg://u:p@db/uc"
    )
    assert (
        database_url(StorageConfig(type="postgres", path="postgresql://u:p@db/uc"))
        == "postgresql+asyncpg://u:p@db/uc"
    )


async def test_a_setting_is_none_until_set_then_replaced() -> None:
    database = Database(StorageConfig(type="memory"))
    await database.init()
    assert await database.settings.get("city_seed") is None
    await database.settings.set("city_seed", "a")
    await database.settings.set("city_seed", "b")
    assert await database.settings.get("city_seed") == "b"
    await database.close()


async def test_settings_survive_a_restart_with_sqlite(tmp_path: Path) -> None:
    config = StorageConfig(type="sqlite", path=str(tmp_path / "sub" / "uptime.db"))
    first = Database(config)
    await first.init()
    await first.settings.set("city_seed", "kept")
    await first.close()

    second = Database(config)
    await second.init()
    assert await second.settings.get("city_seed") == "kept"
    await second.close()


def test_retention_is_30_days_by_default_and_counts_in_days() -> None:
    assert StorageConfig().retention == timedelta(days=30)
    assert StorageConfig.model_validate({"retention": "7d"}).retention == timedelta(days=7)
    assert parse_duration("2d") == timedelta(days=2)


NOW = datetime(2026, 1, 31, 12, 0, tzinfo=UTC)


def result(minutes_ago: int, success: bool = True, error: str | None = None) -> ProbeResult:
    return ProbeResult(
        ts=NOW - timedelta(minutes=minutes_ago),
        success=success,
        latency_ms=None if error else 3.5,
        error=error,
        host_down=error == "host is down",
    )


async def test_results_come_back_oldest_first_per_endpoint_limited() -> None:
    database = Database(StorageConfig(type="memory"))
    await database.init()
    for minutes_ago in (5, 1, 3):
        await database.results.add("a", result(minutes_ago))
    await database.results.add("b", result(2))

    kept = await database.results.recent("a", 2)
    assert [r.ts for r in kept] == [NOW - timedelta(minutes=3), NOW - timedelta(minutes=1)]
    assert [r.ts for r in await database.results.recent("b", 50)] == [NOW - timedelta(minutes=2)]
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


@pytest.mark.parametrize("steps", [1, 3, 10, 30])
async def test_cancelling_a_caller_does_not_cut_a_query_short(steps: int) -> None:
    # The monitor is cancelled at shutdown, maybe in the middle of saving a result: the database
    # must still work afterwards (a connection cut short would lose a whole in-memory database).
    database = Database(StorageConfig(type="memory"))
    await database.init()
    task = asyncio.create_task(database.results.add("a", result(1)))
    for _ in range(steps):
        await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert await database.results.recent("a", 50) == [result(1)]
    await database.close()


@pytest.mark.parametrize("steps", [1, 3, 10, 30])
async def test_closing_waits_for_the_query_a_cancelled_caller_left_running(
    steps: int, tmp_path: Path
) -> None:
    config = StorageConfig(type="sqlite", path=str(tmp_path / "uptime.db"))
    database = Database(config)
    await database.init()
    task = asyncio.create_task(database.results.add("a", result(1)))
    for _ in range(steps):
        await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    # Closing does not break the write that is still running: it is done once closed.
    await database.close()

    reopened = Database(config)
    await reopened.init()
    assert await reopened.results.recent("a", 50) == [result(1)]
    await reopened.close()
