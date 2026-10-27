import re
from datetime import timedelta
from typing import Literal
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    ConfigDict,
    computed_field,
    field_validator,
    model_validator,
)

from uptime_city.config.models.client import ClientConfig
from uptime_city.config.models.duration import Duration

_ICMP_PREFIX = "icmp://"
_HTTP_PREFIXES = ("http://", "https://")
_TCP_PREFIX = "tcp://"

Kind = Literal["physical", "vm", "service"]


def slug(name: str) -> str:
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
            except ValueError as exception:
                raise ValueError(f"invalid tcp url {value!r}: {exception}") from exception
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
        if self.is_http and not any(
            condition.lstrip().startswith("[STATUS]") for condition in self.conditions
        ):
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
        return slug(self.name)

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
