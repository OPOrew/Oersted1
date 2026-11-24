package com.oersted.trainer.sim

import com.oersted.trainer.sim.AudioDsp.FilterType
import com.oersted.trainer.sim.AudioDsp.Wave
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.sin

/**
 * The synthesised fallbacks of the aural warnings in audio.ts buildFx(): the gear / take-off-config / cabin-altitude horn, the
 * autopilot disconnect wailer (a siren) and the stall stick-shakers. The web plays the recorded loops when they decode and only falls
 * back to these when a file fails to load (`fx.horn(false)` while a sample exists); [AudioEngine] does the same.
 *
 * Each group follows mkBus: audible while wanted and for 1.5 s after release so the gain can fade. Parameters follow setTargetAtTime
 * ([FxBank.Param]); targets and time constants come from [FxTargets]. Update on the mixer thread (AudioMixer.post).
 */
class WarningVoices(private val sr: Int, seed: Long = 5L) : AudioMixer.Voice {

    // ── horn: 425 Hz square + 850 Hz square (0.4), low-passed 2200, chopped by a 2.2 Hz square (gain 0.5 +- 0.5) ──
    private val hornA = AudioDsp.Oscillator(Wave.SQUARE, sr.toDouble())
    private val hornB = AudioDsp.Oscillator(Wave.SQUARE, sr.toDouble())
    private val hornLp = AudioDsp.Biquad(FilterType.LOWPASS, sr.toDouble(), 2200.0, 1.0)
    private val hornLfo = AudioDsp.Oscillator(Wave.SQUARE, sr.toDouble())
    private val hornEn = FxBank.Param(0.0)
    private val bHorn = FxBank.Bus()

    // ── wailer: saw 1000 Hz + square 2000 Hz (0.22), both swept +- 520 cents by a 1.5 Hz triangle, peaking 1500 Hz +5 dB, low-passed 3400 ──
    private val wailA = AudioDsp.Oscillator(Wave.SAWTOOTH, sr.toDouble())
    private val wailB = AudioDsp.Oscillator(Wave.SQUARE, sr.toDouble())
    private val wailLfo = AudioDsp.Oscillator(Wave.TRIANGLE, sr.toDouble())
    private val wailPk = Peaking(sr.toDouble(), 1500.0, 0.9, 5.0)
    private val wailLp = AudioDsp.Biquad(FilterType.LOWPASS, sr.toDouble(), 3400.0, 1.0)
    private val wailEn = FxBank.Param(0.0)
    private val bWail = FxBank.Bus()

    // ── stick shakers: a looped eccentric-weight motor on each column (17 and 18 rev/s), pan -0.3 / +0.3 ──
    private inner class Motor(revs: Int, pan: Double, loopSeed: Long) {
        val pcm = AudioSounds.shakerLoop(sr.toDouble(), revs, loopSeed)
        val lp = AudioDsp.Biquad(FilterType.LOWPASS, sr.toDouble(), 1700.0, 0.6)
        var pos = 0.0
        val gl: Double
        val gr: Double

        init {
            val p = AudioDsp.equalPowerPan(pan)
            gl = p.first
            gr = p.second
        }

        fun next(rate: Double): Double {
            val n = pcm.size
            val i = floor(pos).toInt()
            val f = pos - i
            val v = pcm[i % n] * (1 - f) + pcm[(i + 1) % n] * f
            pos += rate
            if (pos >= n) pos -= n
            return lp.process(v) * 0.8
        }
    }

    private val motors = AudioTicker.Tunables.SHAKER_REVS.mapIndexed { i, revs -> Motor(revs.toInt(), if (i == 0) -0.3 else 0.3, seed + i) }
    private val shEn = FxBank.Param(0.0)
    private val bShake = FxBank.Bus()
    private var shOn = false
    private var rateStart = 1.0
    private var rateEnd = 1.0
    private var rateDur = 0.0
    private var rateT0 = 0.0
    private var now = 0.0

    /** The motors' playback rate at [t] (the linear ramp of the last state change, then held). */
    private fun rateAt(t: Double): Double {
        if (rateDur <= 0.0) return rateEnd
        val k = ((t - rateT0) / rateDur).coerceIn(0.0, 1.0)
        return rateStart + (rateEnd - rateStart) * k
    }

    // ── updates (web fx.horn / wailer / shaker) ──

    fun horn(on: Boolean, at: Double) {
        val (bus, ramp) = FxTargets.horn(on)
        bHorn.set(bus, at)
        hornEn.set(ramp)
    }

    fun wailer(on: Boolean, at: Double) {
        val (bus, ramp) = FxTargets.wailer(on)
        bWail.set(bus, at)
        wailEn.set(ramp)
    }

    fun shaker(on: Boolean, at: Double) {
        val t = FxTargets.shaker(on, rateAt(at))
        bShake.set(t.busOn, at)
        if (on != shOn) {
            shOn = on
            rateStart = t.rateRamp.start
            rateEnd = t.rateRamp.end
            rateDur = t.rateRamp.durationS
            rateT0 = at
        }
        shEn.set(t.enableGain)
    }

    /** True while any group is audible. */
    fun active(): Boolean = bHorn.active || bWail.active || bShake.active

    override fun render(l: FloatArray, r: FloatArray, n: Int, mixer: AudioMixer): Boolean {
        now = mixer.time
        bHorn.update(now); bWail.update(now); bShake.update(now)
        var off = 0
        while (off < n) {
            val m = minOf(CHUNK, n - off)
            val dt = m.toDouble() / sr
            val hg = hornEn.step(dt)
            val wg = wailEn.step(dt)
            val sg = shEn.step(dt)
            if (bHorn.active && hg > 1e-7) {
                for (i in 0 until m) {
                    val pulse = 0.5 + 0.5 * hornLfo.next(2.2)
                    val v = hornLp.process(hornA.next(425.0) + 0.4 * hornB.next(850.0)) * pulse * hg
                    l[off + i] += v.toFloat()
                    r[off + i] += v.toFloat()
                }
            }
            if (bWail.active && wg > 1e-7) {
                for (i in 0 until m) {
                    val mult = 2.0.pow(wailLfo.next(1.5) * 520.0 / 1200.0)
                    val v = wailLp.process(wailPk.process(wailA.next(1000.0 * mult) + 0.22 * wailB.next(2000.0 * mult))) * wg
                    l[off + i] += v.toFloat()
                    r[off + i] += v.toFloat()
                }
            }
            if (bShake.active) {
                val rate = rateAt(now + off.toDouble() / sr)
                if (sg > 1e-7) {
                    for (i in 0 until m) for (mo in motors) {
                        val v = mo.next(rate) * sg
                        l[off + i] += (v * mo.gl).toFloat()
                        r[off + i] += (v * mo.gr).toFloat()
                    }
                }
            }
            off += m
        }
        return true
    }

    /** RBJ peaking EQ (Web Audio `peaking`, Q linear). */
    class Peaking(sr: Double, freq: Double, q: Double, gainDb: Double) {
        private val b0: Double
        private val b1: Double
        private val b2: Double
        private val a1: Double
        private val a2: Double
        private var x1 = 0.0
        private var x2 = 0.0
        private var y1 = 0.0
        private var y2 = 0.0

        init {
            val a = 10.0.pow(gainDb / 40.0)
            val w0 = 2 * PI * freq / sr
            val alpha = sin(w0) / (2 * q)
            val a0 = 1 + alpha / a
            b0 = (1 + alpha * a) / a0
            b1 = -2 * cos(w0) / a0
            b2 = (1 - alpha * a) / a0
            a1 = -2 * cos(w0) / a0
            a2 = (1 - alpha / a) / a0
        }

        fun process(x: Double): Double {
            val y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2 = x1; x1 = x; y2 = y1; y1 = y
            return y
        }
    }

    companion object {
        const val CHUNK = 64
    }
}
