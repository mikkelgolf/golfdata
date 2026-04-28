/**
 * Shared Albers USA projection helpers used by USMap and the Manual Grid
 * map view. Kept in one place so the two components stay aligned in scale
 * and translate.
 */

import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection } from "geojson";
import usTopology from "@/data/us-states-10m.json";

export const SVG_WIDTH = 975;
export const SVG_HEIGHT = 610;

export const projection = geoAlbersUsa()
  .scale(1300)
  .translate([SVG_WIDTH / 2, SVG_HEIGHT / 2]);

export const pathGen = geoPath(projection);

const topo = usTopology as unknown as Topology;

export const statesGeo = feature(
  topo,
  topo.objects.states as GeometryCollection
) as FeatureCollection;

export const stateBorderPath = pathGen(
  mesh(topo, topo.objects.states as GeometryCollection, (a, b) => a !== b)
);

export const nationBorderPath = pathGen(
  mesh(topo, topo.objects.nation as GeometryCollection)
);

/** Project lat/lng to SVG coordinates; returns null if outside Albers USA. */
export function projectPoint(
  lat: number,
  lng: number
): { x: number; y: number } | null {
  const p = projection([lng, lat]);
  return p ? { x: p[0], y: p[1] } : null;
}
