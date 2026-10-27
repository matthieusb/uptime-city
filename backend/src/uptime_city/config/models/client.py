from datetime import timedelta

from pydantic import BaseModel

from uptime_city.config.models.duration import Duration


class ClientConfig(BaseModel):
    timeout: Duration = timedelta(seconds=30)
    insecure: bool = False
