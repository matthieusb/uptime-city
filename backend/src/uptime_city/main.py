import uvicorn
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="uptime-city")

    @app.get("/api/v1/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


def run() -> None:
    uvicorn.run("uptime_city.main:create_app", factory=True, host="127.0.0.1", port=8000)
