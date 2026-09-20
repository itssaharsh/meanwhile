// The subsolar point — where the sun is directly overhead — from the date alone. Standard
// low-precision solar position (USNO/NOAA form); good to ~0.1°, far inside the terminator's
// 0.9° feather. No query, no network: the terminator is true even with the backend down.
const RAD = Math.PI / 180;

export function subsolarPoint(date: Date): { lat: number; lng: number } {
  const d = date.getTime() / 86400000 - 10957.5; // days since J2000.0 (2000-01-01 12:00 UTC)
  const g = (357.529 + 0.98560028 * d) * RAD; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude, degrees
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * RAD; // obliquity
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD / 15; // hours
  let eqt = ((q / 15 - ra) % 24 + 24) % 24; // equation of time, hours
  if (eqt > 12) eqt -= 24;
  const utc = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lng = -15 * (utc - 12 + eqt);
  lng = ((lng + 540) % 360) - 180;
  return { lat: dec / RAD, lng };
}

/** three-globe's polar→cartesian convention (lng 0 on +z), as a unit vector. */
export function toUnitVector(lat: number, lng: number): [number, number, number] {
  const phi = (90 - lat) * RAD;
  const theta = (90 - lng) * RAD;
  return [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
}
