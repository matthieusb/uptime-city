from datetime import timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict

from uptime_city.config.models.duration import Duration


class StorageConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["sqlite", "postgres", "memory"] = "sqlite"
    path: str = "data/uptime.db"
    """The SQLite file, or the PostgreSQL DSN (`postgres://user:pass@host/db`)."""
    retention: Duration = timedelta(days=30)
    """How long the results are kept: older ones are deleted."""
