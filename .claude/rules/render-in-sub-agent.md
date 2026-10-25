---
paths:
  - "frontend/**"
---

# Render and look in a sub-agent

When rendering the page and looking at it (browser, screenshot, DOM or layout inspection), do it in a sub-agent, never in the main conversation.

- The sub-agent starts what it needs (dev server, mocked API), renders, looks, and cleans up after itself.
- It returns a diagnostic of what it saw and a proposed solution, not the raw screenshots or logs.
- The main agent then applies the solution, and asks for another render to confirm the fix when the change is visual.
