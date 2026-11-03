/** Local airport reference table used by the Flight Plan planner and its station map. */
export const AIRPORT_COORDS: Record<string, { lat: number; lon: number; label: string }> = {
  RPLL: { lat: 14.5086, lon: 121.0198, label: "Manila / NAIA" },
  WSSS: { lat: 1.3502, lon: 103.9940, label: "Singapore Changi" },
  WMKK: { lat: 2.7456, lon: 101.7072, label: "Kuala Lumpur" },
};
