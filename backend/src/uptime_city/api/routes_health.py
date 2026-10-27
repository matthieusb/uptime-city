from fastapi import APIRouter

router = APIRouter(prefix="/api/v1")


# Liveness probe for the container and the proxy: answers as long as the app is up.
@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
