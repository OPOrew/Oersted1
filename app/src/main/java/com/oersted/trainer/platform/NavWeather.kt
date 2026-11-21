package com.oersted.trainer.platform

import org.json.JSONObject
import com.oersted.trainer.sim.NavMapRules
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/**
 * Android side of InteractiveNavMap's loadWeather() / loadRadar(): METAR (VATSIM, falling back to aviationweather.gov), TAF and PIREP text for the
 * flight-plan airports plus the Philippine / regional list, and the newest RainViewer radar frame. Same endpoints and fallbacks as the web.
 */
object NavWeather {
    data class Wx(val metar: String, val taf: String, val pirep: String, val error: String? = null)

    /** Last METAR text, shared with the weather model (web globalThis.__oerstedLastMetar). */
    @Volatile var lastMetar: String = ""

    private fun text(url: String): String? = try {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 8000; c.readTimeout = 8000
            c.setRequestProperty("User-Agent", "OerstedTrainer-Android/1.0")
            if (c.responseCode in 200..299) c.inputStream.use { it.readBytes() }.toString(Charsets.UTF_8) else null
        } finally { c.disconnect() }
    } catch (e: Exception) { null }

    suspend fun loadWeather(dep: String?, dest: String?): Wx = withContext(Dispatchers.IO) {
        val ids = NavMapRules.weatherIds(dep, dest)
        try {
            var metar = text("https://metar.vatsim.net/$ids") ?: ""
            if (metar.isEmpty()) metar = text("https://aviationweather.gov/api/data/metar?ids=$ids&format=raw") ?: ""
            val taf = text("https://aviationweather.gov/api/data/taf?ids=$ids&format=raw") ?: ""
            val pirep = text("https://aviationweather.gov/api/data/pirep?id=$ids&format=raw&age=2") ?: ""
            lastMetar = metar
            Wx(metar.trim().ifEmpty { "No METAR" }, taf.trim().ifEmpty { "No TAF" }, pirep.trim().ifEmpty { "No recent PIREPs" })
        } catch (e: Exception) {
            Wx("", "", "", "Weather fetch failed (network or CORS). Try again later.")
        }
    }

    /** XYZ template of the latest radar frame, or null. */
    suspend fun loadRadarTemplate(): String? = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject(text("https://api.rainviewer.com/public/weather-maps.json") ?: return@withContext null)
            val frames = json.optJSONObject("radar")?.optJSONArray("past") ?: return@withContext null
            if (frames.length() == 0) return@withContext null
            val latest = frames.getJSONObject(frames.length() - 1)
            NavMapRules.radarTileTemplate(json.optString("host", "https://tilecache.rainviewer.com"), latest.getString("path"))
        } catch (e: Exception) { null }
    }
}
