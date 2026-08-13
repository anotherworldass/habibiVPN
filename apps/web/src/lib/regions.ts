/** Approximate city anchors for region codes (lat, lng) */
export const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  AE: { lat: 25.2, lng: 55.3 },
  AU: { lat: -33.9, lng: 151.2 },
  BR: { lat: -23.55, lng: -46.63 },
  CA: { lat: 43.65, lng: -79.38 },
  CH: { lat: 47.38, lng: 8.54 },
  DE: { lat: 50.11, lng: 8.68 },
  FR: { lat: 48.86, lng: 2.35 },
  GB: { lat: 51.51, lng: -0.13 },
  HK: { lat: 22.32, lng: 114.17 },
  IN: { lat: 19.08, lng: 72.88 },
  JP: { lat: 35.68, lng: 139.69 },
  KR: { lat: 37.57, lng: 126.98 },
  NL: { lat: 52.37, lng: 4.9 },
  PH: { lat: 14.6, lng: 120.98 },
  SE: { lat: 59.33, lng: 18.07 },
  SG: { lat: 1.35, lng: 103.82 },
  TW: { lat: 25.03, lng: 121.57 },
  US: { lat: 37.77, lng: -122.42 },
  VN: { lat: 10.82, lng: 106.63 },
  UN: { lat: 0, lng: 0 },
};

/**
 * Extra pixel offsets (on 720×360 canvas) for dense areas like Europe.
 * Keeps geographic "origin" for leader lines, spreads display markers.
 */
export const REGION_DISPLAY_OFFSET: Record<string, { dx: number; dy: number }> = {
  GB: { dx: -34, dy: -22 },
  IE: { dx: -48, dy: -8 },
  NL: { dx: -8, dy: -28 },
  BE: { dx: -18, dy: -6 },
  FR: { dx: -28, dy: 18 },
  DE: { dx: 22, dy: -18 },
  CH: { dx: 8, dy: 22 },
  AT: { dx: 28, dy: 10 },
  IT: { dx: 18, dy: 34 },
  ES: { dx: -42, dy: 32 },
  PT: { dx: -56, dy: 28 },
  SE: { dx: 36, dy: -36 },
  NO: { dx: 18, dy: -48 },
  DK: { dx: 12, dy: -30 },
  FI: { dx: 52, dy: -40 },
  PL: { dx: 42, dy: -8 },
  CZ: { dx: 30, dy: 4 },
};

export function projectEquirectangular(
  lat: number,
  lng: number,
  width: number,
  height: number,
) {
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}

/** Push overlapping markers apart (simple iterative repulsion). */
export function spreadOverlappingPoints<
  T extends { x: number; y: number; radius: number },
>(points: T[], minGap = 6, iterations = 40): T[] {
  const out = points.map((p) => ({ ...p }));
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const need = a.radius + b.radius + minGap;
        if (dist < 0.01) {
          dx = (i % 2 === 0 ? 1 : -1) * 0.8;
          dy = (j % 2 === 0 ? 1 : -1) * 0.8;
          dist = Math.hypot(dx, dy);
        }
        if (dist < need) {
          const push = ((need - dist) / dist) * 0.5;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
  }
  return out;
}
