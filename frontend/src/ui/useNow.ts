import { useEffect, useState } from 'react'

// The current time in milliseconds, up to date every `intervalMs`, for what shows how long ago
// something was.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
