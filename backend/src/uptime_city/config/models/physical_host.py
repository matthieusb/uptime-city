from pydantic import ConfigDict, Field, model_validator

from uptime_city.config.models.endpoint import Kind
from uptime_city.config.models.vm_host import VmHost


class PhysicalHost(VmHost):
    """The top layer: it contains services and vm-hosts."""

    model_config = ConfigDict(populate_by_name=True)

    vm_hosts: list[VmHost] = Field(default=[], alias="vm-hosts")

    @property
    def kind(self) -> Kind:
        return "physical"

    @model_validator(mode="after")
    def _attach_vm_hosts(self) -> "PhysicalHost":
        for vm_host in self.vm_hosts:
            vm_host._parent_id = self.id  # pyright: ignore[reportPrivateUsage]
        return self
