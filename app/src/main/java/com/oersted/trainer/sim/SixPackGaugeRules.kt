package com.oersted.trainer.sim

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sign
import kotlin.math.sqrt

/**
 * Pure maths of the gauges in components/panel/SixPack.tsx (Airspeed, Attitude, Altimeter, VerticalSpeed, Heading, TurnSlip, and the
 * SixPackSet header): dial angles, pointer / ladder geometry, readout strings. The data feed (roll / pitch / heading / yaw rate and the
 * blanking of unpowered air data) is [SixPackData]; the drawing is ui/instruments/SixPackGauges.kt.
 */
object SixPackGaugeRules {
    private fun jsRound(x: Double): Double = Math.floor(x + 0.5)
    private fun clamp(n: Double, lo: Double, hi: Double) = min(hi, max(lo, n))

    /** web Airspeed `A(k)`: 0-400 kt over -150..+150 degrees. */
    fun airspeedAngle(kt: Double): Double = -150 + (kt / 400) * 300

    /** Airspeed pointer angle: the indication clamped to 0..400 kt. */
    fun airspeedPointer(iasKt: Double): Double = airspeedAngle(clamp(iasKt, 0.0, 400.0))

    /** web VerticalSpeed `A(f)`: square-root scale, zero at 9 o'clock, climb up / right. */
    fun vsAngle(fpm: Double): Double = -90 + sign(fpm) * sqrt(abs(fpm) / 6000) * 88

    fun vsPointer(vsiFpm: Double): Double = vsAngle(clamp(vsiFpm, -6000.0, 6000.0))

    /** web VerticalSpeed marks: 0, 500, 1000, 1500, 2000, 4000, 6000 (both signs except 0). */
    val VS_MARKS = listOf(0, 500, 1000, 1500, 2000, 4000, 6000)

    /** Marks of at least 1000 fpm (and zero) are long and numbered. */
    fun vsBig(f: Int): Boolean = f == 0 || f >= 1000

    /** The numeral printed for a big mark: f / 1000 as JavaScript prints it (1, 1.5, 2, 4, 6). */
    fun vsLabel(f: Int): String = if (f % 1000 == 0) (f / 1000).toString() else (f / 1000.0).toString()

    /** web VerticalSpeed digital value: "+N" above zero, "N" otherwise, after rounding. */
    fun vsText(vsiFpm: Double): String {
        val v = clamp(vsiFpm, -6000.0, 6000.0)
        val r = jsRound(v).toLong()
        return (if (r > 0) "+" else "") + r
    }

    /** web Altimeter: altitude floored at -1000 ft. */
    fun altitude(altFt: Double): Double = max(-1000.0, altFt)

    private fun wrap(x: Double, m: Double): Double = ((x % m) + m) % m

    /** Hundreds hand (one revolution per 1000 ft). */
    fun altHundredsDeg(altFt: Double): Double = wrap(altitude(altFt), 1000.0) / 1000 * 360

    /** Ten-thousands hand (one revolution per 10 000 ft). */
    fun altTenKDeg(altFt: Double): Double = wrap(altitude(altFt), 10000.0) / 10000 * 360

    /** Drum window text: rounded altitude with en-US thousands separators. */
    fun altText(altFt: Double): String = PitotStaticRules.groupedRound(altitude(altFt))

    /** web `Math.round(x).toString().padStart(3, "0")` */
    fun pad3(x: Double): String = jsRound(x).toLong().toString().padStart(3, '0')

    /** Airspeed window: rounded IAS padded to three digits. */
    fun iasText(iasKt: Double): String = pad3(iasKt)

    /** Heading normalised to 0..360 as in the web. */
    fun normHeading(h: Double): Double = ((h % 360) + 360) % 360

    fun headingText(h: Double): String = pad3(normHeading(h)) + "°"

    /** web Heading card label: N / E / S / W at the cardinal points, otherwise tens of degrees. */
    fun headingLabel(deg: Int): String = when (deg) { 0 -> "N"; 90 -> "E"; 180 -> "S"; 270 -> "W"; else -> (deg / 10).toString() }

    /** web Attitude pitch ladder: marks every 10 degrees (-30..30), long for +-30. */
    val PITCH_MARKS = listOf(-30, -20, -10, 10, 20, 30)
    val PITCH_TICKS = listOf(-25, -15, -5, 5, 15, 25)

    /** Ladder / tick line y for a pitch mark: 3 view-box units per degree about the horizon at y = 100. */
    fun ladderY(p: Int): Double = 100.0 - p * 3

    /** Half width of a ladder line: 18 at 10, 24 at 20, else 30. */
    fun ladderHalfWidth(p: Int): Double = if (abs(p) == 10) 18.0 else if (abs(p) == 20) 24.0 else 30.0

    /** Only the 20 and 40 style marks carry a numeral. */
    fun ladderLabelled(p: Int): Boolean = abs(p) % 20 == 0

    /** Roll scale marks. */
    val ROLL_MARKS = listOf(-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60)
    fun rollTickInner(a: Int): Double = if (a == 0) 78.0 else 82.0
    fun rollTickWidth(a: Int): Double = if (a == 0 || a % 30 == 0) 2.2 else 1.2

    /** web TurnSlip: standard rate (3 deg/s) is 20 degrees of needle; the ball moves 2.2 units per deg/s. */
    fun turnNeedle(yawRate: Double): Double = clamp(clamp(yawRate, -12.0, 12.0) * (20.0 / 3), -40.0, 40.0)
    fun turnBall(yawRate: Double): Double = clamp(clamp(yawRate, -12.0, 12.0) * 2.2, -28.0, 28.0)

    /** web SixPackSet status chip text. */
    fun status(flags: List<String>): String = if (flags.isEmpty()) "NORMAL AIR DATA" else flags.joinToString(" · ")
}
