package com.oersted.trainer.sim

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Pure rules of components/panel/B737200ControlStand.tsx (the compact CENTER CONTROL STAND · 737-200 used as the aside of the
 * Flight Controls module): hydraulic gates for the spoiler lamps, the thrust label, reverser deploy interlock, the vertical
 * thrust lever value and the scaleToFit factor. The Compose view is ui/panel/B737200ControlStandView.kt.
 */
object B737200ControlStandRules {
    private fun jsRound(x: Double): Double = floor(x + 0.5)

    /** web DESIGN_W: the width the stand is laid out at before it is scaled down. */
    const val DESIGN_W = 1040.0

    /** web MAX_SCALE */
    const val MAX_SCALE = 0.5

    /** web `hydAok` / `hydBok`: pressure above 1500 psi and the flight-control system available. */
    fun hydOk(hyd: Double, flightControlAvailable: Boolean): Boolean = hyd > 1500 && flightControlAvailable

    /** web `pedestalLabel`: "<throttle1 %> / <throttle2 %>%". */
    fun pedestalLabel(throttle1: Double, throttle2: Double): String = "${jsRound(throttle1 * 100).toInt()} / ${jsRound(throttle2 * 100).toInt()}%"

    class Reverser(val allowed: Boolean, val note: String)

    /**
     * web reverse lever onClick: when not commanded, deploy needs ground + engine running + thrust at most 0.05 + fire handle not
     * pulled + HYD A above 1500 psi; otherwise only the inhibit note is logged and rev is not changed.
     */
    fun reverser(n: Int, commandedRev: Boolean, wow: Boolean, running: Boolean, throttle: Double, firePulled: Boolean, hydA: Double): Reverser {
        val canDeploy = wow && running && throttle <= 0.05 && !firePulled && hydA > 1500
        if (!commandedRev && !canDeploy) return Reverser(false, "ENG $n REVERSER DEPLOY INHIBITED — ground/engine/fire/hydraulic interlock not satisfied.")
        return Reverser(true, "ENG $n REVERSER ${if (commandedRev) "STOW" else "DEPLOY"}")
    }

    /** web stab trim cutout toggle note. */
    fun cutoutNote(side: String, on: Boolean): String = "STAB TRIM CUTOUT $side → ${if (on) "CUTOUT" else "NORMAL"}"

    /** web VerticalLever: 180 px track, 36 px thumb. */
    const val TRACK_H = 180.0
    const val THUMB_H = 36.0

    /** Thumb top (px from the top of the track) for a lever [value] 0..1 (full thrust at the top). */
    fun thumbTop(value: Double): Double = (TRACK_H - THUMB_H) * (1 - max(0.0, min(1.0, value)))

    /** Lever value (step 0.01) for a pointer [y] px from the top of the track, the thumb centred on the pointer. */
    fun valueAt(y: Double): Double {
        val raw = 1 - (y - THUMB_H / 2) / (TRACK_H - THUMB_H)
        return max(0.0, min(1.0, jsRound(raw * 100) / 100))
    }

    /** web ScaledStand scale: the container width over the design width, at most [MAX_SCALE]; 0.3 when the width is not known yet. */
    fun scale(containerWidth: Double): Double {
        val v = min(MAX_SCALE, containerWidth / DESIGN_W)
        return if (v == 0.0 || v.isNaN()) 0.3 else v
    }
}
