from datetime import UTC, datetime

from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncEngine

from uptime_city.probes.base import ProbeResult
from uptime_city.storage.gate import Gate
from uptime_city.storage.schema import results


class ResultStore:
    """Every probe result, kept in the database until the retention is over."""

    def __init__(self, engine: AsyncEngine, gate: Gate) -> None:
        self._engine = engine
        self._gate = gate

    async def add(self, endpoint_id: str, result: ProbeResult) -> None:
        async def query() -> None:
            async with self._engine.begin() as connection:
                await connection.execute(
                    insert(results).values(
                        endpoint_id=endpoint_id,
                        ts=result.ts.astimezone(UTC),
                        success=result.success,
                        latency_ms=result.latency_ms,
                        error=result.error,
                        host_down=result.host_down,
                    )
                )

        await self._gate.run(query)

    async def recent(self, endpoint_id: str, limit: int) -> list[ProbeResult]:
        """The last `limit` results of an endpoint, oldest first."""
        statement = (
            select(results)
            .where(results.c.endpoint_id == endpoint_id)
            .order_by(results.c.ts.desc(), results.c.id.desc())
            .limit(limit)
        )

        async def query() -> list[ProbeResult]:
            async with self._engine.connect() as connection:
                rows = (await connection.execute(statement)).all()
            return [
                ProbeResult(
                    # SQLite gives back the time without its zone: it was stored in UTC.
                    ts=row.ts if row.ts.tzinfo else row.ts.replace(tzinfo=UTC),
                    success=row.success,
                    latency_ms=row.latency_ms,
                    error=row.error,
                    host_down=row.host_down,
                )
                for row in reversed(rows)
            ]

        return await self._gate.run(query)

    async def prune(self, before: datetime) -> int:
        """Deletes the results older than `before`, and tells how many."""

        async def query() -> int:
            async with self._engine.begin() as connection:
                deleted = await connection.execute(delete(results).where(results.c.ts < before))
                return deleted.rowcount

        return await self._gate.run(query)
