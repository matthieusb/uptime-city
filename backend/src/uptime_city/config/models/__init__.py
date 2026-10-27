# The configuration models, one module per type. Everything is re-exported here, so that the rest
# of the code imports from `uptime_city.config.models`.
from uptime_city.config.models.client import ClientConfig
from uptime_city.config.models.config import Config
from uptime_city.config.models.duration import Duration, parse_duration
from uptime_city.config.models.endpoint import Endpoint, Kind, slug
from uptime_city.config.models.physical_host import PhysicalHost
from uptime_city.config.models.service import Service
from uptime_city.config.models.storage import StorageConfig
from uptime_city.config.models.vm_host import VmHost

__all__ = [
    "ClientConfig",
    "Config",
    "Duration",
    "Endpoint",
    "Kind",
    "PhysicalHost",
    "Service",
    "StorageConfig",
    "VmHost",
    "parse_duration",
    "slug",
]
