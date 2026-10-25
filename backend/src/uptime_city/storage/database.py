from datetime import timedelta

from uptime_city.config.models import StorageConfig
from uptime_city.storage.engine import make_engine
from uptime_city.storage.gate import Gate
from uptime_city.storage.results import ResultStore
from uptime_city.storage.schema import metadata
from uptime_city.storage.settings import SettingsStore


class Database:
    """The database picked by the config, and the stores that share it."""

    def __init__(self, config: StorageConfig) -> None:
        self._engine = make_engine(config)
        self.retention: timedelta = config.retention
        self._gate = Gate()
        self.settings = SettingsStore(self._engine, self._gate)
        self.results = ResultStore(self._engine, self._gate)

    async def init(self) -> None:
        async with self._engine.begin() as connection:
            await connection.run_sync(metadata.create_all)

    async def close(self) -> None:
        await self._gate.drain()
        await self._engine.dispose()
