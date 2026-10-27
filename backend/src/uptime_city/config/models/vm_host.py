from pydantic import Field, PrivateAttr, model_validator

from uptime_city.config.models.endpoint import Endpoint, Kind
from uptime_city.config.models.service import Service


class VmHost(Endpoint):
    """A virtual machine: it contains services only."""

    services: list[Service] = Field(default_factory=list[Service])
    _parent_id: str = PrivateAttr("")

    @property
    def kind(self) -> Kind:
        return "vm"

    @property
    def parent_id(self) -> str | None:
        return self._parent_id or None

    @model_validator(mode="after")
    def _attach_services(self) -> "VmHost":
        for service in self.services:
            service._host_id = self.id  # pyright: ignore[reportPrivateUsage]
        return self
