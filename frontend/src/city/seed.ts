// What makes one city different from another: mixed into every random draw of the layout, so
// that the same seed lays the same city (the seed is kept by the backend) and another seed
// another one. Empty, the draws are the plain ones.
let seed = ''

export const setWorldSeed = (next: string) => {
  seed = next
}

// The text a draw hashes, tied to the seed.
export const seeded = (text: string) => (seed ? `${seed}|${text}` : text)
