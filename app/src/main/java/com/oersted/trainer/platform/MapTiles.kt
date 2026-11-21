package com.oersted.trainer.platform

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/**
 * Raster tile loader for the Interactive Navigation Map (OpenStreetMap base layer and the RainViewer radar overlay, as the web's Leaflet layers).
 * In-memory LRU only (the web relies on the browser cache); failed tiles are remembered for 30 s so an offline map does not retry every frame.
 * Needs android.permission.INTERNET. Verified on CI, not compiled in the sandbox.
 */
object MapTiles {
    private val cache = object : LruCache<String, ImageBitmap>(220) {}
    private val failedAt = HashMap<String, Long>()
    private val gate = Semaphore(6)

    fun peek(url: String): ImageBitmap? = cache.get(url)

    /** Loads (and caches) a tile; null when offline or the server refuses. */
    suspend fun get(url: String): ImageBitmap? {
        cache.get(url)?.let { return it }
        val failed = synchronized(failedAt) { failedAt[url] }
        if (failed != null && System.currentTimeMillis() - failed < 30_000) return null
        return withContext(Dispatchers.IO) {
            gate.withPermit {
                try {
                    val conn = URL(url).openConnection() as HttpURLConnection
                    try {
                        conn.connectTimeout = 8000; conn.readTimeout = 8000
                        // OpenStreetMap's tile usage policy asks for an identifying User-Agent.
                        conn.setRequestProperty("User-Agent", "OerstedTrainer-Android/1.0 (training simulator)")
                        if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode}")
                        val bytes = conn.inputStream.use { it.readBytes() }
                        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() ?: throw IllegalStateException("decode")
                        cache.put(url, bmp)
                        bmp
                    } finally { conn.disconnect() }
                } catch (e: Exception) {
                    synchronized(failedAt) { failedAt[url] = System.currentTimeMillis() }
                    null
                }
            }
        }
    }
}
