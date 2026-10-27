// How the atlas the islands are drawn in is bent onto the sphere. Each island lies in a cell of a
// grid and is wrapped round the sphere about its own middle: a point `d` away from the middle of
// its plate on the ground (at any height y) ends up `d` away along the sphere, at the height y
// over it. So the distances along the ground are kept, and what stands on the ground stands up
// straight. The TypeScript functions are the model of the GLSL below, which does the same in the
// vertex shaders (see bendPatch.ts).
import type { Planet } from './planet'
import { add, scale, unit, type Vec3 } from './sphere'

// The island whose cell holds the point (x, z) of the atlas: the nearest one outside the grid.
export function islandAt(planet: Planet, x: number, z: number): number {
  const rows = Math.ceil(planet.islands.length / planet.columns)
  const column = Math.min(
    planet.columns - 1,
    Math.max(0, Math.floor(x / planet.cell + 0.5)),
  )
  const row = Math.min(rows - 1, Math.max(0, Math.floor(z / planet.cell + 0.5)))
  return Math.min(row * planet.columns + column, planet.islands.length - 1)
}

// Where the point (x, y, z) of the atlas is on the planet.
export function bendPoint(planet: Planet, [x, y, z]: Vec3): Vec3 {
  const island = planet.islands[islandAt(planet, x, z)]
  const [dx, dz] = [x - island.x, z - island.z]
  const reach = Math.hypot(dx, dz)
  const angle = reach / planet.radius
  const along =
    reach > 1e-5
      ? add(scale(island.xAxis, dx / reach), scale(island.zAxis, dz / reach))
      : island.xAxis
  const direction = add(
    scale(island.normal, Math.cos(angle)),
    scale(along, Math.sin(angle)),
  )
  return scale(direction, planet.radius + y)
}

// The direction `normal`, a direction of the atlas at the point `at`, as it is once bent.
export function bendNormal(planet: Planet, at: Vec3, normal: Vec3): Vec3 {
  const island = planet.islands[islandAt(planet, at[0], at[2])]
  const [dx, dz] = [at[0] - island.x, at[2] - island.z]
  const reach = Math.hypot(dx, dz)
  const angle = reach / planet.radius
  // On the ground of the atlas: away from the middle of the island, up, and across.
  const [rx, rz] = reach > 1e-5 ? [dx / reach, dz / reach] : [1, 0]
  const outward = rx * normal[0] + rz * normal[2]
  const across = -rz * normal[0] + rx * normal[2]
  const along = add(scale(island.xAxis, rx), scale(island.zAxis, rz))
  const sideways = add(scale(island.xAxis, -rz), scale(island.zAxis, rx))
  // On the planet: the same three directions.
  const up = add(
    scale(island.normal, Math.cos(angle)),
    scale(along, Math.sin(angle)),
  )
  const onward = add(
    scale(island.normal, -Math.sin(angle)),
    scale(along, Math.cos(angle)),
  )
  return unit(
    add(
      add(scale(onward, outward), scale(up, normal[1])),
      scale(sideways, across),
    ),
  )
}

const num = (value: number) => value.toFixed(6)
const vec = ([x, y, z]: Vec3) => `vec3(${num(x)}, ${num(y)}, ${num(z)})`

// The GLSL that bends the atlas of a planet: the frames of its islands are in the source, and
// `planetBendPosition` and `planetBendNormal` do what the functions above do.
export function bendGlsl(planet: Planet): string {
  const count = planet.islands.length
  const array = (
    name: string,
    pick: (island: Planet['islands'][number]) => Vec3,
  ) =>
    `const vec3 ${name}[PLANET_COUNT] = vec3[PLANET_COUNT](${planet.islands
      .map((island) => vec(pick(island)))
      .join(', ')});`
  return /* glsl */ `
const float PLANET_RADIUS = ${num(planet.radius)};
const float PLANET_CELL = ${num(planet.cell)};
const int PLANET_COLUMNS = ${planet.columns};
const int PLANET_COUNT = ${count};
${array('PLANET_UP', (island) => island.normal)}
${array('PLANET_X', (island) => island.xAxis)}
${array('PLANET_Z', (island) => island.zAxis)}

// The island whose cell holds the point, the nearest one outside the grid.
int planetIsland(vec3 p) {
  float rows = float((PLANET_COUNT + PLANET_COLUMNS - 1) / PLANET_COLUMNS);
  float column = clamp(floor(p.x / PLANET_CELL + 0.5), 0.0, float(PLANET_COLUMNS - 1));
  float row = clamp(floor(p.z / PLANET_CELL + 0.5), 0.0, rows - 1.0);
  return min(int(row) * PLANET_COLUMNS + int(column), PLANET_COUNT - 1);
}

vec2 planetCenter(int k) {
  return vec2(float(k - (k / PLANET_COLUMNS) * PLANET_COLUMNS), float(k / PLANET_COLUMNS)) * PLANET_CELL;
}

vec3 planetBendPosition(vec3 p) {
  int k = planetIsland(p);
  vec2 d = p.xz - planetCenter(k);
  float reach = length(d);
  float angle = reach / PLANET_RADIUS;
  vec3 along = reach > 0.00001 ? (PLANET_X[k] * d.x + PLANET_Z[k] * d.y) / reach : PLANET_X[k];
  return (cos(angle) * PLANET_UP[k] + sin(angle) * along) * (PLANET_RADIUS + p.y);
}

vec3 planetBendNormal(vec3 p, vec3 normal) {
  int k = planetIsland(p);
  vec2 d = p.xz - planetCenter(k);
  float reach = length(d);
  float angle = reach / PLANET_RADIUS;
  vec2 r = reach > 0.00001 ? d / reach : vec2(1.0, 0.0);
  float outward = dot(r, normal.xz);
  float across = -r.y * normal.x + r.x * normal.z;
  vec3 along = PLANET_X[k] * r.x + PLANET_Z[k] * r.y;
  vec3 sideways = PLANET_X[k] * -r.y + PLANET_Z[k] * r.x;
  vec3 up = cos(angle) * PLANET_UP[k] + sin(angle) * along;
  vec3 onward = -sin(angle) * PLANET_UP[k] + cos(angle) * along;
  return normalize(onward * outward + up * normal.y + sideways * across);
}
`
}
