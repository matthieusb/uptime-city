from pydantic import PrivateAttr, computed_field

from uptime_city.config.models.endpoint import Endpoint, slug


class Service(Endpoint):
    """Probed only while its host is up. Never inherits settings from its host."""

    _host_id: str = PrivateAttr("")

    @computed_field
    @property
    def id(self) -> str:
        return f"{self._host_id}-{slug(self.name)}" if self._host_id else slug(self.name)

    @property
    def host_id(self) -> str | None:
        return self._host_id or None
