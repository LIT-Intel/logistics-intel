// Ambient declaration for leaflet.heat (no .d.ts shipped by the package).
// MUST live in a script-file context — no top-level imports — for the
// `declare module` to register globally.

declare module "leaflet.heat";

declare namespace L {
  function heatLayer(
    latLngs: Array<[number, number, number]>,
    options?: {
      minOpacity?: number;
      maxZoom?: number;
      max?: number;
      radius?: number;
      blur?: number;
      gradient?: Record<number, string>;
    },
  ): unknown;
}
