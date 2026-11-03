import { useEffect, useState } from "react";
import { useMip } from "./mipLocal";
import { markerKeyed, type MarkerId } from "./markerBeacons";

/** True while the marker is being received AND the keying (tone pattern) is in its ON part — drives the MIP marker lamps and the side-view display. */
export function useMarkerKeyed(id: MarkerId, powered: boolean): boolean {
  const received = useMip().markers?.[id] ?? false;
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!received || !powered) return;
    const iv = setInterval(() => setT(performance.now() / 1000), 40);
    return () => clearInterval(iv);
  }, [received, powered]);
  return !!(received && powered && markerKeyed(id, t));
}
