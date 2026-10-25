FROM python:3.13-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.13 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev --no-editable

FROM python:3.13-slim
RUN useradd --system --create-home --uid 10001 app \
    && mkdir -p /app/data && chown app /app/data
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" UPTIME_CITY_HOST=0.0.0.0
USER app
VOLUME /app/data
EXPOSE 8000
CMD ["uptime-city", "--config", "/config/config.yaml"]
