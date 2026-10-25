import asyncio
import contextlib
from pathlib import Path

import pytest

from tests.helpers import result
from uptime_city.config.models import StorageConfig
from uptime_city.storage.database import Database
from uptime_city.storage.gate import Gate


async def save_then_cancel(database: Database, steps: int) -> None:
    """Cancels the caller of a save after `steps` turns of the event loop, whatever has happened.

    The query runs in a thread, so how many turns it takes depends on the machine's load: a quick
    one can be over before the cancellation, which then changes nothing, and that is fine.
    """
    task = asyncio.create_task(database.results.add("a", result(1)))
    for _ in range(steps):
        await asyncio.sleep(0)
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


@pytest.mark.parametrize("steps", [1, 3, 10, 30])
async def test_cancelling_a_caller_does_not_cut_a_query_short(steps: int) -> None:
    # The monitor is cancelled at shutdown, maybe in the middle of saving a result: the database
    # must still work afterwards (a connection cut short would lose a whole in-memory database).
    database = Database(StorageConfig(type="memory"))
    await database.init()
    await save_then_cancel(database, steps)

    assert await database.results.recent("a", 50) == [result(1)]
    await database.close()


@pytest.mark.parametrize("steps", [1, 3, 10, 30])
async def test_closing_waits_for_the_query_a_cancelled_caller_left_running(
    steps: int, tmp_path: Path
) -> None:
    config = StorageConfig(type="sqlite", path=str(tmp_path / "uptime.db"))
    database = Database(config)
    await database.init()
    await save_then_cancel(database, steps)

    # Closing does not break the write that is still running: it is done once closed.
    await database.close()

    reopened = Database(config)
    await reopened.init()
    assert await reopened.results.recent("a", 50) == [result(1)]
    await reopened.close()


async def test_the_gate_never_runs_two_queries_at_once() -> None:
    gate = Gate()
    running = 0
    most = 0
    finished: list[int] = []

    def query(n: int):
        async def run() -> int:
            nonlocal running, most
            running += 1
            most = max(most, running)
            for _ in range(3):
                await asyncio.sleep(0)
            running -= 1
            finished.append(n)
            return n * 10

        return run

    answers = await asyncio.gather(*(gate.run(query(n)) for n in range(5)))

    assert most == 1
    assert answers == [0, 10, 20, 30, 40]
    assert finished == [0, 1, 2, 3, 4]


async def test_a_query_that_raises_releases_the_gate() -> None:
    gate = Gate()

    async def failing() -> None:
        raise ValueError("bad query")

    async def fine() -> str:
        return "done"

    with pytest.raises(ValueError, match="bad query"):
        await gate.run(failing)
    async with asyncio.timeout(5):
        assert await gate.run(fine) == "done"


async def test_draining_waits_for_the_queries_still_running() -> None:
    gate = Gate()
    release = asyncio.Event()
    started = asyncio.Event()

    async def slow() -> None:
        started.set()
        await release.wait()

    caller = asyncio.create_task(gate.run(slow))
    await started.wait()
    caller.cancel()  # the caller leaves, the query does not
    drained = asyncio.create_task(gate.drain())
    for _ in range(5):
        await asyncio.sleep(0)
    assert not drained.done()

    release.set()
    async with asyncio.timeout(5):
        await drained


async def test_draining_an_idle_gate_returns_at_once() -> None:
    async with asyncio.timeout(5):
        await Gate().drain()
