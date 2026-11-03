import { setLiveWeather, intensityFromRgb, type WxCell } from "./wxrWorld";

/**
 * Sample RainViewer precipitation near a geographic point and push cells
 * into the weather-radar store. Also reports overall intensity for flight effects.
 */
export async function sampleLiveWeather(lat: number, lon: number) {
  try {
    const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
    if (!res.ok) return;
    const data = await res.json();
    const frames = data?.radar?.past;
    if (!frames?.length) return;
    const latest = frames[frames.length - 1];
    const host = data.host || "https://tilecache.rainviewer.com";
    // Coordinate tile centered on the aircraft (zoom 5 ≈ regional view)
    const tileUrl = `${host}${latest.path}/256/5/${lat.toFixed(3)}/${lon.toFixed(3)}/2/1_1.png`;
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = tileUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, 64, 64);
    const pixels = ctx.getImageData(0, 0, 64, 64).data;
    let sum = 0;
    let count = 0;
    const cells: WxCell[] = [];
    // Sample a coarse grid and turn bright pixels into radar cells
    for (let y = 8; y < 56; y += 16) {
      for (let x = 8; x < 56; x += 16) {
        const i = (y * 64 + x) * 4;
        const inten = intensityFromRgb(pixels[i], pixels[i + 1], pixels[i + 2]);
        sum += inten;
        count++;
        if (inten > 0.25) {
          // Map pixel offset to approximate nm (very rough regional scale)
          const nmX = (x - 32) * 4;
          const nmY = (32 - y) * 4;
          cells.push({ x: nmX, y: nmY, r: 6 + inten * 8, asp: 1.2, ang: 30 });
        }
      }
    }
    const intensity = count ? sum / count : 0;
    const thunderstorm = intensity > 0.75 || /TS|TSRA|VCTS/.test((globalThis as any).__oerstedLastMetar || "");
    setLiveWeather(cells, intensity, thunderstorm);
    (globalThis as any).__oerstedLiveWxIntensity = intensity;
  } catch {
    // Network or CORS failure — leave previous cells
  }
}
