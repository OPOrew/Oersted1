package com.oersted.trainer.platform

import android.content.Context
import android.media.MediaPlayer
import com.oersted.trainer.sim.AudioEvents

/**
 * Android side of the web's sampled loops (audio.ts SAMPLE_PATHS / mkSampleLoop / ensureSampleLoops).
 * The web crossfades each loop to hide seams; here each loop is a looping MediaPlayer, so a seam may click on some devices.
 * Acts only on changes of the desired state, as the web does. Not compiled in the sandbox (needs the Android SDK).
 */
class SamplePlayer(private val context: Context) {

    /** The six aural samples. [paths] are tried in order, the first that loads is used (AUTO-disconnect has an mp3 and a wav). */
    enum class Loop(val paths: List<String>, val gain: Float) {
        FIRE_BELL(listOf("sounds/fire-bell-loop.mp3"), 0.42f),
        STICK_SHAKER(listOf("sounds/stickshaker.mp3"), 0.38f),
        AP_DISCONNECT(listOf("sounds/autopilot-disconnect.mp3", "sounds/autopilot-disconnect.wav"), 0.4f),
        GLIDESLOPE(listOf("sounds/glideslope.mp3"), 0.4f),
        GPWS_VOCAB(listOf("sounds/gpws-vocabulary.mp3"), 0.42f),
        CONFIG_HORN(listOf("sounds/takeoff-config-cabin-altitude.mp3"), 0.4f),
    }

    private val players = HashMap<Loop, MediaPlayer>()
    private val wanted = HashMap<Loop, Boolean>()
    private var masterVolume = 1f

    /** Loads every sample that has a file in assets. Missing files leave that loop silent (the web falls back the same way). */
    fun load() {
        for (loop in Loop.values()) {
            if (players.containsKey(loop)) continue
            for (path in loop.paths) {
                val mp = openLooping(path) ?: continue
                players[loop] = mp
                break
            }
        }
    }

    /** True when the sample for [loop] is loaded; the synth fallback is used otherwise. */
    fun isLoaded(loop: Loop): Boolean = players.containsKey(loop)

    /**
     * Applies the desired state. Only loops whose state changed are touched.
     * [fireBell] is the fire bell's desired state from AudioTicker; the other loops come from the frame's Loops flags.
     */
    fun apply(loops: AudioEvents.Loops, fireBell: Boolean) {
        set(Loop.FIRE_BELL, fireBell)
        set(Loop.STICK_SHAKER, loops.stickShaker)
        set(Loop.AP_DISCONNECT, loops.apDisconnectWailer)
        set(Loop.GLIDESLOPE, loops.glideslope)
        set(Loop.GPWS_VOCAB, loops.gpwsVocab)
        set(Loop.CONFIG_HORN, loops.configCabinHorn)
    }

    /** Master volume 0..1, as the web's setVolume. */
    fun setVolume(v: Float) {
        masterVolume = v.coerceIn(0f, 1f)
        for ((loop, mp) in players) if (wanted[loop] == true) mp.setVolume(loop.gain * masterVolume, loop.gain * masterVolume)
    }

    /** Stops every loop (sound switched off). */
    fun stopAll() {
        for (loop in Loop.values()) set(loop, false)
    }

    fun release() {
        for (mp in players.values) runCatching { mp.release() }
        players.clear()
        wanted.clear()
    }

    private fun set(loop: Loop, on: Boolean) {
        if (wanted[loop] == on) return
        wanted[loop] = on
        val mp = players[loop] ?: return
        if (on) {
            val g = loop.gain * masterVolume
            mp.setVolume(g, g)
            runCatching { mp.start() }
        } else {
            runCatching { mp.pause(); mp.seekTo(0) }
        }
    }

    private fun openLooping(path: String): MediaPlayer? = try {
        context.assets.openFd(path).use { fd ->
            MediaPlayer().apply {
                setDataSource(fd.fileDescriptor, fd.startOffset, fd.length)
                isLooping = true
                prepare()
            }
        }
    } catch (e: Exception) {
        null
    }
}
