import asyncio
from collections.abc import Awaitable, Callable
from typing import Any


class Gate:
    """One query at a time, and a query that a cancelled caller cannot cut short.

    SQLite has a single writer, and the in-memory one a single connection, which another task's
    rollback would cut under a running transaction. A query cut short by a cancellation (the
    monitor is cancelled at shutdown, maybe while saving a result) would make the pool throw the
    connection away, and with it a whole in-memory database: so the query always runs to its end.
    """

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._running = set[asyncio.Future[Any]]()

    async def run[T](self, query: Callable[[], Awaitable[T]]) -> T:
        async def locked() -> T:
            async with self._lock:
                return await query()

        running = asyncio.ensure_future(locked())
        self._running.add(running)
        running.add_done_callback(self._finished)
        return await asyncio.shield(running)

    def _finished(self, running: asyncio.Future[Any]) -> None:
        self._running.discard(running)
        # A query left running by a cancelled caller fails with nobody to tell: not "never retrieved".
        if not running.cancelled():
            running.exception()

    async def drain(self) -> None:
        """Waits for the queries still running, before the database is closed under them."""
        while self._running:
            await asyncio.gather(*self._running, return_exceptions=True)
