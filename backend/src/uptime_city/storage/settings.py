from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import AsyncEngine

from uptime_city.storage.gate import Gate
from uptime_city.storage.schema import settings


class SettingsStore:
    """Key/value settings kept in the database, whatever the dialect."""

    def __init__(self, engine: AsyncEngine, gate: Gate) -> None:
        self._engine = engine
        self._gate = gate

    async def get(self, key: str) -> str | None:
        async def query() -> str | None:
            async with self._engine.connect() as connection:
                result = await connection.execute(
                    select(settings.c.value).where(settings.c.key == key)
                )
                return result.scalar_one_or_none()

        return await self._gate.run(query)

    async def set(self, key: str, value: str) -> None:
        async def query() -> None:
            async with self._engine.begin() as connection:
                updated = await connection.execute(
                    update(settings).where(settings.c.key == key).values(value=value)
                )
                if updated.rowcount == 0:
                    await connection.execute(insert(settings).values(key=key, value=value))

        await self._gate.run(query)
