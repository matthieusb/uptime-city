from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from uptime_city.config.models.endpoint import Endpoint
from uptime_city.config.models.physical_host import PhysicalHost
from uptime_city.config.models.storage import StorageConfig


class Config(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    lab_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)] = Field(
        default="lab-map", alias="lab-name"
    )
    """Shown over the 3D map, left of the service counts."""
    storage: StorageConfig = StorageConfig()
    hosts: list[PhysicalHost]

    @model_validator(mode="after")
    def _unique_ids(self) -> "Config":
        ids = [endpoint.id for endpoint in self.endpoints]
        duplicates = sorted({id for id in ids if ids.count(id) > 1})
        if duplicates:
            raise ValueError(f"duplicate endpoint ids: {', '.join(duplicates)}")
        return self

    @property
    def endpoints(self) -> list[Endpoint]:
        """Every check, each host followed by its services, and by its vm-hosts."""
        return [
            e
            for host in self.hosts
            for e in (
                host,
                *host.services,
                *(e for vm in host.vm_hosts for e in (vm, *vm.services)),
            )
        ]
