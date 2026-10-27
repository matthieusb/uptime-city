import { useMemo } from 'react'
import { Matrix4, Quaternion, Vector3 } from 'three'
import type { Bridge } from './bridges'
import { deckSegments } from './deck'

const WIDTH = 1.6
const THICKNESS = 0.35
const DECK_COLOR = '#8d7b63'

// The bridges between the islands: a flat deck made of straight pieces from point to point.
export default function Bridges({ bridges }: { bridges: Bridge[] }) {
  const pieces = useMemo(
    () =>
      bridges.flatMap((bridge) =>
        deckSegments(bridge.points).map((segment, i) => {
          const forward = new Vector3(...segment.direction)
          // Its length along Z, its up the way up is there, away from the middle of the planet.
          const up = new Vector3(...segment.center).normalize()
          const side = new Vector3().crossVectors(up, forward).normalize()
          const top = new Vector3().crossVectors(forward, side).normalize()
          const quaternion = new Quaternion().setFromRotationMatrix(
            new Matrix4().makeBasis(side, top, forward),
          )
          return {
            key: `${bridge.from}|${bridge.to}|${i}`,
            position: segment.center,
            quaternion,
            length: segment.length,
          }
        }),
      ),
    [bridges],
  )
  return (
    <group raycast={() => null}>
      {pieces.map((piece) => (
        <mesh
          key={piece.key}
          position={piece.position}
          quaternion={piece.quaternion}
          castShadow
          receiveShadow
          raycast={() => null}
        >
          <boxGeometry args={[WIDTH, THICKNESS, piece.length + 0.1]} />
          <meshStandardMaterial color={DECK_COLOR} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}
