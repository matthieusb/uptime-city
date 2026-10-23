---
paths:
  - "backend/tests/**"
  - "frontend/tests/unit/**"
---

# No real hosts in unit tests

Unit tests never touch the network or real hosts (ping, HTTP, DNS, TCP, even `127.0.0.1`): they are unreliable and fail on CI.

Mock the actual ping or HTTP result instead:

- ICMP: patch `async_ping` and return a fake alive or dead `Host`.
- HTTP (backend): use `respx`.
- HTTP (frontend): stub `fetch`.
