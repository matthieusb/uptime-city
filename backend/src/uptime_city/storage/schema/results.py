from sqlalchemy import Boolean, Column, DateTime, Float, Index, Integer, String, Table, Text

from uptime_city.storage.schema.metadata import metadata

results = Table(
    "results",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("endpoint_id", String(255), nullable=False),
    Column("ts", DateTime(timezone=True), nullable=False),
    Column("success", Boolean, nullable=False),
    Column("latency_ms", Float(asdecimal=False)),
    Column("error", Text),
    Column("host_down", Boolean, nullable=False),
    Index("ix_results_endpoint_ts", "endpoint_id", "ts"),
)
