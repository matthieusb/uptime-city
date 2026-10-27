// The sea of the planet: a sphere the islands stand on, the bridges cross and the pointer ignores.
export const SEA_COLOR = '#2f78c4'

export default function PlanetSea({ radius }: { radius: number }) {
  return (
    <mesh receiveShadow raycast={() => null}>
      <sphereGeometry args={[radius, 96, 64]} />
      <meshStandardMaterial color={SEA_COLOR} roughness={0.9} flatShading />
    </mesh>
  )
}
