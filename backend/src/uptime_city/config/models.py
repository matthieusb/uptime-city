import re
from datetime import timedelta
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PrivateAttr,
    StringConstraints,
    computed_field,
    field_validator,
    model_validator,
)

_DURATION = re.compile(r"^(\d+(?:\.\d+)?)(ms|s|m|h)$")
_UNITS = {"ms": 0.001, "s": 1, "m": 60, "h": 3600}
_ICMP_PREFIX = "icmp://"
_HTTP_PREFIXES = ("http://", "https://")
_TCP_PREFIX = "tcp://"


def parse_duration(value: str) -> timedelta:
    match = _DURATION.match(value.strip())
    if match is None:
        raise ValueError(f"invalid duration {value!r} (expected e.g. 30s, 5m, 1h)")
    return timedelta(seconds=float(match[1]) * _UNITS[match[2]])


def _to_duration(value: object) -> object:
    return parse_duration(value) if isinstance(value, str) else value


Duration = Annotated[timedelta, BeforeValidator(_to_duration)]

Kind = Literal["physical", "vm", "service"]


class ClientConfig(BaseModel):
    timeout: Duration = timedelta(seconds=30)
    insecure: bool = False


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


class Endpoint(BaseModel):
    """A single check: either a host's own check or one of its services."""

    model_config = ConfigDict(extra="forbid")

    name: str
    url: str
    interval: Duration = timedelta(seconds=60)
    method: str = "GET"
    body: str | None = None
    headers: dict[str, str] = {}
    client: ClientConfig = ClientConfig()
    conditions: list[str] = []

    @field_validator("url")
    @classmethod
    def _supported_url(cls, value: str) -> str:
        if value.startswith(_HTTP_PREFIXES):
            return value
        if value.startswith(_TCP_PREFIX):
            try:
                parts = urlsplit(value)
                port = parts.port
            except ValueError as exc:
                raise ValueError(f"invalid tcp url {value!r}: {exc}") from exc
            if not parts.hostname or port is None:
                raise ValueError("tcp endpoints need tcp://<host>:<port>")
            return value
        if not value.startswith(_ICMP_PREFIX) or len(value) == len(_ICMP_PREFIX):
            raise ValueError(
                "only icmp://<hostname>, tcp://<host>:<port> and http(s):// are supported"
            )
        return value

    @model_validator(mode="after")
    def _http_expects_a_status(self) -> "Endpoint":
        if self.is_http and not any(c.lstrip().startswith("[STATUS]") for c in self.conditions):
            raise ValueError(
                f"http endpoint {self.name!r} must state its expected status, "
                'e.g. conditions: ["[STATUS] == 200"]'
            )
        return self

    @property
    def is_http(self) -> bool:
        return self.url.startswith(_HTTP_PREFIXES)

    @computed_field
    @property
    def id(self) -> str:
        return _slug(self.name)

    @property
    def host_id(self) -> str | None:
        return None

    @property
    def kind(self) -> Kind:
        return "service"

    @property
    def parent_id(self) -> str | None:
        """For a vm-host, the physical host it runs on."""
        return None

    @property
    def scheme(self) -> str:
        return "tcp" if self.url.startswith(_TCP_PREFIX) else "icmp"

    @property
    def hostname(self) -> str:
        if self.scheme == "tcp":
            return urlsplit(self.url).hostname or ""
        return self.url.removeprefix(_ICMP_PREFIX)

    @property
    def port(self) -> int | None:
        return urlsplit(self.url).port if self.scheme == "tcp" else None


class Service(Endpoint):
    """Probed only while its host is up. Never inherits settings from its host."""

    _host_id: str = PrivateAttr("")

    @computed_field
    @property
    def id(self) -> str:
        return f"{self._host_id}-{_slug(self.name)}" if self._host_id else _slug(self.name)

    @property
    def host_id(self) -> str | None:
        return self._host_id or None


class VmHost(Endpoint):
    """A virtual machine: it contains services only."""

    services: list[Service] = []
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


class PhysicalHost(VmHost):
    """The top layer: it contains services and vm-hosts."""

    model_config = ConfigDict(populate_by_name=True)

    vm_hosts: list[VmHost] = Field(default=[], alias="vm-hosts")

    @property
    def kind(self) -> Kind:
        return "physical"

    @model_validator(mode="after")
    def _attach_vm_hosts(self) -> "PhysicalHost":
        for vm in self.vm_hosts:
            vm._parent_id = self.id  # pyright: ignore[reportPrivateUsage]
        return self


class Config(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    lab_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)] = Field(
        default="lab-map", alias="lab-name"
    )
    """Shown over the 3D map, left of the service counts."""
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
