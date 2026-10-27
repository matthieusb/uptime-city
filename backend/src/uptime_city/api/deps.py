from fastapi import Request

from uptime_city.monitor.scheduler import Monitor
from uptime_city.storage.settings import SettingsStore


def get_monitor(request: Request) -> Monitor:
    return request.app.state.monitor


def get_store(request: Request) -> SettingsStore:
    return request.app.state.database.settings
