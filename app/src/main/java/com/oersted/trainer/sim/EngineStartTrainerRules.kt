package com.oersted.trainer.sim

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** Rules of EngineStartTrainerPanel in routes/cockpit.tsx (the Engine Start training section). Pure. */
object EngineStartTrainerRules {
    /** Minimum starter air pressure: the chips go green from 30 psi. */
    const val STARTER_AIR_MIN_PSI = 30.0

    private fun round(v: Double): Long = floor(v + 0.5).toLong()

    /** web status(e) */
    fun status(running: Boolean, firePulled: Boolean, autoStart: Boolean, n2: Double): String =
        if (running) "RUNNING"
        else if (firePulled) "FIRE HANDLE PULLED"
        else if (autoStart) (if (n2 < 20) "MOTORING ON STARTER" else "LIGHT-OFF / ACCELERATING")
        else if (n2 > 1) "SPOOLING DOWN"
        else "SHUT DOWN"

    fun subTitle(side: Int, status: String): String = "Engine $side · $status"

    /** The shutdown button is disabled only when nothing is running or starting and N2 is below 1 %. */
    fun shutdownDisabled(running: Boolean, auto: Boolean, n2: Double): Boolean = !running && !auto && n2 < 1

    /** web `fuelOn={e.lever && e.n2 > 18 && !e.fire}` for the cutaway */
    fun fuelOn(lever: Boolean, n2: Double, firePulled: Boolean): Boolean = lever && n2 > 18 && !firePulled

    /** web Tape: value as a percentage of [max], clamped 0..100 */
    fun tapePercent(value: Double, max: Double): Double = max(0.0, min(100.0, value / max * 100))

    fun tapeValue(v: Double): Long = round(v)

    /** Bottom line of the engine block. */
    fun readoutLine(ff: Double, oil: Double, starterPsi: Double): String =
        "FF ${round(ff)} PPH · OIL ${round(oil)} PSI · STARTER AIR ${round(starterPsi)} PSI (≥ 30 REQUIRED)"

    fun dcChip(dcPower: Boolean): String = "DC ${if (dcPower) "AVAILABLE" else "OFF"}"
    fun ductChip(side: String, psi: Double): String = "$side DUCT ${round(psi)} PSI"
    fun ductOk(psi: Double): Boolean = psi >= STARTER_AIR_MIN_PSI

    const val START_HINT =
        "START selects GRD; the pneumatic starter turns N2, IDLE is set automatically at ~20% N2, and the starter cuts out near 38% N2. " +
            "The P5 START switches and IDLE levers stay live for a manual start."

    fun batteryLabel(on: Boolean): String = "BATTERY · ${if (on) "ON" else "OFF"}"
    fun groundAirLabel(connected: Boolean): String = "GROUND AIR CART · ${if (connected) "CONNECTED" else "DISCONNECTED"}"
    fun groundPowerLabel(connected: Boolean): String = "GROUND POWER · ${if (connected) "CONNECTED" else "DISCONNECTED"}"
    fun apuLabel(masterOff: Boolean, available: Boolean): String = "APU + BLEED · ${FuelAndGroundRules.apuAndBleedLabel(masterOff, available)}"
    fun cutawayLabel(shown: Boolean): String = "ENGINE CUTAWAY · ${if (shown) "SHOWN" else "HIDDEN"}"
}
