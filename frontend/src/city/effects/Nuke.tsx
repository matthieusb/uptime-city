import { Fires, Mushroom, Shockwave } from './NukeMeshes'
import { cloudScale } from './nukeShape'
import { sweptAt } from './restoreShape'
import { growthAt } from './strikeShape'

// A mushroom cloud of noise-shaded fire and smoke, smooth and not made of voxels like the rest of
// the town, that churns slowly over the middle of a nuked ground (see `NukeMeshes.tsx`), taller and
// wider the bigger the tile (`cloudScale`), over voxel fires that burn on the ground. When the
// strike started at `startedAt` (milliseconds), it grows out of the impact; without one, it is
// full grown. Its glow goes out as the wave of the restoration (`restoredAt`) sweeps it away.
export default function Nuke({
  startedAt = null,
  restoredAt = null,
  halfWidth,
  halfDepth,
}: {
  startedAt?: number | null
  restoredAt?: number | null
  // The size of the tile it stands on, for the blast to cross and the fires to burn on.
  halfWidth: number
  halfDepth: number
}) {
  const growth = () => growthAt(startedAt, Date.now())
  const glow = () => 1 - sweptAt(restoredAt, Date.now())
  const size = cloudScale(halfWidth, halfDepth)
  return (
    <group>
      <Mushroom growth={growth} glow={glow} size={size} />
      {/* The shock wave runs out across the tile, ahead of the cloud, and sets it on fire. */}
      <Shockwave
        startedAt={startedAt}
        reach={Math.hypot(halfWidth, halfDepth)}
      />
      <Fires
        startedAt={startedAt}
        halfWidth={halfWidth}
        halfDepth={halfDepth}
      />
    </group>
  )
}
