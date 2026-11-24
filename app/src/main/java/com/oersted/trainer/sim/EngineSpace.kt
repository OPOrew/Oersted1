package com.oersted.trainer.sim

import com.oersted.trainer.sim.AudioDsp.FilterType
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Port of `engFx` in lib/sim/audio.ts: the "engine space" the two engine voices send into. A big-hall reverb (a 1.3 s stereo impulse
 * response of decaying, darkening noise with a few early reflections, 30 ms pre-delay, wet 0.2) plus a soft ping-pong echo
 * (190 ms / 270 ms, feedback 0.32, 1500 Hz low-pass, out 0.08), so the engines sit in a large open space instead of inside the speaker.
 *
 * The Web Audio ConvolverNode is reproduced as a uniformly partitioned FFT convolution of the same generated impulse response, with
 * the node's default normalisation (Chromium: scale = 1 / rms * 10^(-58/20) * 44100 / sampleRate). Each channel is convolved with its
 * own IR channel (stereo input, stereo IR). The block FFT adds one block of latency; it is taken off the pre-delay so the first echo of the
 * reverb still arrives 30 ms after the dry sound.
 *
 * Pure Kotlin, mixer thread only. [process] adds the wet signal into [outL] / [outR]; nothing is added after the input has been silent
 * long enough for every tail to die (the state is cleared at that point).
 */
class EngineSpace(private val sr: Int, seed: Long = 7L) {

    private val block = BLOCK
    private val fftN = 2 * BLOCK
    private val parts: Int

    // impulse response spectra per channel: [part][re | im]
    private val hRe: Array<Array<DoubleArray>>
    private val hIm: Array<Array<DoubleArray>>

    // frequency-domain delay line of past input spectra per channel
    private val xRe: Array<Array<DoubleArray>>
    private val xIm: Array<Array<DoubleArray>>
    private var slot = 0

    private val prev = Array(2) { DoubleArray(block) }
    private val cur = Array(2) { DoubleArray(block) }
    private val outCur = Array(2) { DoubleArray(block) }
    private val outNext = Array(2) { DoubleArray(block) }
    private var fill = 0

    private val twRe = DoubleArray(fftN / 2) { cos(-2 * PI * it / fftN) }
    private val twIm = DoubleArray(fftN / 2) { sin(-2 * PI * it / fftN) }
    private val bitrev = IntArray(fftN)
    private val fr = DoubleArray(fftN)
    private val fi = DoubleArray(fftN)
    private val accRe = DoubleArray(fftN)
    private val accIm = DoubleArray(fftN)

    // pre-delay (30 ms less the block latency of the convolver)
    private val preLen = maxOf(0, Math.round(PRE_S * sr).toInt() - block)
    private val pre = Array(2) { DoubleArray(maxOf(1, preLen)) }
    private var prePos = 0

    // echo: eL = delay(in + fb * eR), eR = delay(eL); both taps are the wet outputs
    private val eLen = Math.round(ECHO_L_S * sr).toInt()
    private val eRLen = Math.round(ECHO_R_S * sr).toInt()
    private val eBufL = DoubleArray(eLen)
    private val eBufR = DoubleArray(eRLen)
    private var eposL = 0
    private var eposR = 0
    private val eLp = AudioDsp.Biquad(FilterType.LOWPASS, sr.toDouble(), 1500.0, 1.0)

    private var silent = 0L
    private var asleep = true

    init {
        var bits = 0
        while ((1 shl bits) < fftN) bits++
        for (i in 0 until fftN) {
            var r = 0
            for (b in 0 until bits) if (i and (1 shl b) != 0) r = r or (1 shl (bits - 1 - b))
            bitrev[i] = r
        }
        val ir = buildImpulseResponse(sr, seed)
        parts = (ir[0].size + block - 1) / block
        hRe = Array(2) { Array(parts) { DoubleArray(fftN) } }
        hIm = Array(2) { Array(parts) { DoubleArray(fftN) } }
        xRe = Array(2) { Array(parts) { DoubleArray(fftN) } }
        xIm = Array(2) { Array(parts) { DoubleArray(fftN) } }
        for (c in 0..1) for (p in 0 until parts) {
            java.util.Arrays.fill(fr, 0.0)
            java.util.Arrays.fill(fi, 0.0)
            val off = p * block
            for (i in 0 until block) if (off + i < ir[c].size) fr[i] = ir[c][off + i]
            fft(fr, fi, false)
            System.arraycopy(fr, 0, hRe[c][p], 0, fftN)
            System.arraycopy(fi, 0, hIm[c][p], 0, fftN)
        }
    }

    /** Clears every delay line and tail. */
    fun reset() {
        for (c in 0..1) {
            java.util.Arrays.fill(prev[c], 0.0); java.util.Arrays.fill(cur[c], 0.0)
            java.util.Arrays.fill(outCur[c], 0.0); java.util.Arrays.fill(outNext[c], 0.0)
            java.util.Arrays.fill(pre[c], 0.0)
            for (p in 0 until parts) { java.util.Arrays.fill(xRe[c][p], 0.0); java.util.Arrays.fill(xIm[c][p], 0.0) }
        }
        java.util.Arrays.fill(eBufL, 0.0); java.util.Arrays.fill(eBufR, 0.0)
        eposL = 0; eposR = 0; prePos = 0; fill = 0; slot = 0
        eLp.retune(FilterType.LOWPASS, sr.toDouble(), 1500.0, 1.0)
    }

    /** Adds the wet reverb + echo of the send ([inL], [inR]) into [outL] / [outR] for [n] frames. */
    fun process(inL: FloatArray, inR: FloatArray, outL: FloatArray, outR: FloatArray, n: Int) {
        var peak = 0f
        for (i in 0 until n) {
            val a = Math.abs(inL[i]); val b = Math.abs(inR[i])
            if (a > peak) peak = a
            if (b > peak) peak = b
        }
        if (peak < 1e-6f) {
            silent += n
            if (asleep) return
            if (silent > SLEEP_AFTER_S * sr) {
                reset()
                asleep = true
                return
            }
        } else {
            silent = 0
            asleep = false
        }
        for (k in 0 until n) {
            val xl = inL[k].toDouble()
            val xr = inR[k].toDouble()
            // reverb path: pre-delay -> block convolution
            var dl = xl
            var dr = xr
            if (preLen > 0) {
                dl = pre[0][prePos]; dr = pre[1][prePos]
                pre[0][prePos] = xl; pre[1][prePos] = xr
                prePos = (prePos + 1) % preLen
            }
            cur[0][fill] = dl
            cur[1][fill] = dr
            val wl = outCur[0][fill] * WET
            val wr = outCur[1][fill] * WET
            // echo path (mono sum, as the ChannelMerger inputs down-mix)
            val lp = eLp.process((xl + xr) * 0.5)
            val eRout = eBufR[eposR]
            val eLout = eBufL[eposL]
            eBufL[eposL] = lp + ECHO_FB * eRout
            eBufR[eposR] = eLout
            eposL = (eposL + 1) % eLen
            eposR = (eposR + 1) % eRLen
            outL[k] += (wl + eLout * ECHO_OUT).toFloat()
            outR[k] += (wr + eRout * ECHO_OUT).toFloat()
            fill++
            if (fill == block) {
                convolveBlock()
                fill = 0
            }
        }
    }

    /** One uniformly partitioned convolution step for both channels: the finished input block becomes the next output block. */
    private fun convolveBlock() {
        slot = (slot + 1) % parts
        for (c in 0..1) {
            for (i in 0 until block) { fr[i] = prev[c][i]; fr[block + i] = cur[c][i]; fi[i] = 0.0; fi[block + i] = 0.0 }
            fft(fr, fi, false)
            System.arraycopy(fr, 0, xRe[c][slot], 0, fftN)
            System.arraycopy(fi, 0, xIm[c][slot], 0, fftN)
            java.util.Arrays.fill(accRe, 0.0)
            java.util.Arrays.fill(accIm, 0.0)
            for (p in 0 until parts) {
                val s = (slot - p + parts) % parts
                val ar = xRe[c][s]; val ai = xIm[c][s]; val br = hRe[c][p]; val bi = hIm[c][p]
                for (i in 0 until fftN) {
                    accRe[i] += ar[i] * br[i] - ai[i] * bi[i]
                    accIm[i] += ar[i] * bi[i] + ai[i] * br[i]
                }
            }
            fft(accRe, accIm, true)
            for (i in 0 until block) outNext[c][i] = accRe[block + i]
            System.arraycopy(cur[c], 0, prev[c], 0, block)
        }
        for (c in 0..1) System.arraycopy(outNext[c], 0, outCur[c], 0, block)
    }

    /** In-place radix-2 FFT of size [fftN]; [inverse] also divides by N. */
    private fun fft(re: DoubleArray, im: DoubleArray, inverse: Boolean) {
        for (i in 0 until fftN) {
            val j = bitrev[i]
            if (j > i) {
                val tr = re[i]; re[i] = re[j]; re[j] = tr
                val ti = im[i]; im[i] = im[j]; im[j] = ti
            }
        }
        var len = 2
        while (len <= fftN) {
            val half = len / 2
            val step = fftN / len
            var i = 0
            while (i < fftN) {
                for (k in 0 until half) {
                    val wr = twRe[k * step]
                    val wi = if (inverse) -twIm[k * step] else twIm[k * step]
                    val a = i + k
                    val b = a + half
                    val xr = re[b] * wr - im[b] * wi
                    val xi = re[b] * wi + im[b] * wr
                    re[b] = re[a] - xr; im[b] = im[a] - xi
                    re[a] += xr; im[a] += xi
                }
                i += len
            }
            len *= 2
        }
        if (inverse) for (i in 0 until fftN) { re[i] /= fftN; im[i] /= fftN }
    }

    companion object {
        const val BLOCK = 1024
        const val PRE_S = 0.03
        const val WET = 0.2
        const val ECHO_L_S = 0.19
        const val ECHO_R_S = 0.27
        const val ECHO_FB = 0.32
        const val ECHO_OUT = 0.08
        /** Reverb tail 1.3 s + echo loop (460 ms, feedback 0.32): a margin after which the state is cleared. */
        const val SLEEP_AFTER_S = 4.0
        /** Send level of each engine into the space (web `sendG`). */
        const val SEND = 0.9

        /**
         * The web IR: 1.3 s of noise through a one-pole low-pass that darkens as it decays (air absorption), exp(-t/0.4) amplitude, a 20 ms
         * onset, plus four discrete early reflections per ear (the right ear inverted); then the ConvolverNode normalisation.
         */
        fun buildImpulseResponse(sr: Int, seed: Long = 7L): Array<DoubleArray> {
            val len = Math.floor(sr * 1.3).toInt()
            val noise = AudioDsp.Noise(seed)
            val ir = Array(2) { DoubleArray(len) }
            for (ch in 0..1) {
                val d = ir[ch]
                var lp = 0.0
                for (i in 0 until len) {
                    val tt = i.toDouble() / sr
                    val dark = 0.55 - 0.47 * min(1.0, tt / 1.0)
                    lp += dark * (noise.next() - lp)
                    d[i] = lp * exp(-tt / 0.4) * min(1.0, tt / 0.02)
                }
                val taps = if (ch == 0) listOf(23 to 0.5, 41 to 0.35, 67 to 0.3, 97 to 0.22) else listOf(29 to 0.5, 53 to 0.33, 79 to 0.28, 113 to 0.2)
                for ((ms, g) in taps) d[Math.floor(sr * ms / 1000.0).toInt()] += g * (if (ch == 0) 1.0 else -1.0)
            }
            var sum = 0.0
            for (ch in 0..1) for (v in ir[ch]) sum += v * v
            val power = sqrt(sum / (2.0 * len))
            val scale = (1.0 / maxOf(power, 1e-9)) * 10.0.pow(-58.0 * 0.05) * (44100.0 / sr)
            for (ch in 0..1) for (i in 0 until len) ir[ch][i] *= scale
            return ir
        }
    }
}
