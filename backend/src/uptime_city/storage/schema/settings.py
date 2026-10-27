from sqlalchemy import Column, String, Table, Text

from uptime_city.storage.schema.metadata import metadata

settings = Table(
    "settings",
    metadata,
    Column("key", String(64), primary_key=True),
    Column("value", Text, nullable=False),
)
