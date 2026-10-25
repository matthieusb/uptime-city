import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

const PREFIX = 'uptime-city:'

function read<T>(key: string, decode: (raw: unknown) => T | undefined) {
  try {
    const stored = localStorage.getItem(PREFIX + key)
    return stored === null ? undefined : decode(JSON.parse(stored))
  } catch {
    // Storage blocked, or not JSON: as if nothing was stored.
    return undefined
  }
}

// Like `useState`, but the value is kept in the browser's local storage and
// restored on the next load. `decode` checks what comes back from the storage
// (undefined when it is not valid: the fallback is used then); `encode` turns
// a value into something JSON can hold. The storage may be unavailable: the
// state then just lives until the page is closed.
export function usePersistentState<T>(
  key: string,
  fallback: T,
  decode: (raw: unknown) => T | undefined,
  encode: (value: T) => unknown = (value) => value,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => read(key, decode) ?? fallback)
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(encode(value)))
    } catch {
      // Storage blocked or full: nothing to do.
    }
    // `encode` is a pure function of the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value])
  return [value, setValue]
}
