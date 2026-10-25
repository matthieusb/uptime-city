import { afterEach } from 'vitest'

// What the app persists in the browser must not leak from one test to another.
afterEach(() => localStorage.clear())
