package com.oersted.trainer.sim

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * View-side logic of components/panel/FireProtectionTrainer.tsx: per-engine data, card states and tones, chip values, the warning-light
 * strip, the mitigation (recall item) lists, the "effect of handle(s)" line and the flame / mist geometry. The action handlers are in
 * [FireProtectionRules]. Text is copied from the web.
 */
object FireTrainerViewRules {
    const val OK = 0xFF3DD68CL
    const val WARN = 0xFFE24B4BL
    const val CAUT = 0xFFE0A84AL
    const val SUB = 0xFF7D8895L

    private fun rnd(v: Double) = floor(v + 0.5).toLong()

    class Eng(
        val n: Int, val pulled: Boolean, val fire: Boolean, val running: Boolean, val fuel: Boolean, val genBus: Boolean, val pump: Boolean,
        val bleedOk: Boolean, val psi: Double, val lever: Boolean, val n2: Double, val n1: Double, val egt: Double, val valve: Boolean,
    )

    fun eng(s: SimState, d: Derived, n: Int): Eng {
        val one = n == 1
        val pulled = if (one) s.engine1FirePulled else s.engine2FirePulled
        val lever = if (one) s.lever1 else s.lever2
        val n2 = if (one) s.n2_1 else s.n2_2
        return Eng(
            n, pulled, if (one) s.faults.engineFire1 else s.faults.engineFire2, if (one) d.eng1Running else d.eng2Running,
            !pulled && lever && n2 > 18,
            if (one) d.generator1BusPowered else d.generator2BusPowered, if (one) d.hydAPump1On else d.hydAPump2On,
            (if (one) d.bleed1Available else d.bleed2Available) && (if (one) d.leftManifold else d.rightManifold),
            if (one) d.leftDuctPsi else d.rightDuctPsi, lever, n2, if (one) s.n1_1 else s.n1_2, if (one) s.egt1 else s.egt2,
            if (one) d.startValveOpen1 else d.startValveOpen2,
        )
    }

    /** Loop / isolation colour: red on fire, grey once the handle is pulled, green otherwise. */
    fun loopColor(fire: Boolean, pulled: Boolean): Long = if (fire) WARN else if (pulled) SUB else OK

    fun engineState(e: Eng): String =
        if (e.fire) (if (e.pulled) "FIRE · HANDLE PULLED" else "FIRE")
        else if (e.pulled) "SHUT DOWN · HANDLE PULLED" else if (e.running) "RUNNING · NORMAL" else "SHUT DOWN"

    fun engineTone(e: Eng): String = if (e.fire) "warn" else if (e.pulled) "caution" else "ok"

    fun engineLoopLabel(e: Eng): String = if (e.fire) "FIRE LOOP A + B TRIPPED" else if (e.pulled) "LOOPS · HANDLE PULLED" else "FIRE LOOP A / B · NORMAL"

    class ChipData(val label: String, val on: Boolean, val value: String? = null, val warn: Boolean = false) {
        /** Web: value ?? (on ? "ON" : "OFF"). */
        val text: String get() = value ?: (if (on) "ON" else "OFF")
    }

    fun engineChips(e: Eng): List<ChipData> = listOf(
        ChipData("FUEL", e.fuel, if (e.fuel) "FLOW" else "CUT OFF"),
        ChipData("GEN ${e.n}", e.genBus, if (e.genBus) "ON BUS" else "OFF BUS"),
        ChipData("HYD A PUMP", e.pump, if (e.pump) "SUPPLIED" else "NO SUPPLY"),
        ChipData("BLEED", e.bleedOk, if (e.bleedOk) "${rnd(e.psi)} PSI" else "NO BLEED"),
    )

    fun engineHandleLabel(e: Eng): String = if (e.pulled) "Pulled · reset" else if (e.fire) "Pull fire handle" else "Handle locked · no fire"

    // ---- APU ----
    fun apuState(s: SimState, d: Derived): String {
        val fire = s.faults.apuFireDetected
        return if (fire) (if (s.apuFirePulled) "FIRE · HANDLE PULLED" else "FIRE")
        else if (s.apuFirePulled) "SHUT DOWN · HANDLE PULLED" else if (d.apuAvailable) "RUNNING ${rnd(s.apuRpm)}%" else "SHUT DOWN"
    }
    fun apuTone(s: SimState): String = if (s.faults.apuFireDetected) "warn" else if (s.apuFirePulled) "caution" else "ok"
    fun apuLoopLabel(s: SimState): String = if (s.faults.apuFireDetected) "FIRE DETECTOR TRIPPED" else if (s.apuFirePulled) "DETECTOR · HANDLE PULLED" else "FIRE DETECTOR · NORMAL"
    fun apuBleedOn(s: SimState) = s.apuBleed && s.apuBleedValve > 0.5 && !s.apuFirePulled
    fun apuDoorJammed(s: SimState) = s.faults.apuDoorJam && s.apuMaster != "OFF" && s.apuFuelValve > 0.98 && s.apuDoor < 0.98

    fun apuChips(s: SimState, d: Derived): List<ChipData> {
        val flow = s.apuFuelValve > 0.5 && !s.apuFirePulled
        val gen = s.apuGen && d.apuGenOnBus
        val bleed = apuBleedOn(s)
        return listOf(
            ChipData("APU FUEL", flow, if (flow) "FLOW" else "CUT OFF"),
            ChipData("APU GEN", gen, if (gen) "ON BUS" else "OFF BUS"),
            ChipData("APU BLEED", bleed, if (bleed) "SUPPLYING" else "NO BLEED"),
            ChipData("INLET DOOR", s.apuDoor > 0.9, if (s.apuDoor > 0.9) "OPEN" else if (s.apuDoor > 0.05) "MOVING" else "CLOSED"),
        )
    }

    // ---- wheel well ----
    fun gearAvg(s: SimState) = (s.noseGearPos + s.leftMainGearPos + s.rightMainGearPos) / 3
    fun wheelWellState(s: SimState) = if (s.wheelWellFire) "OVERHEAT WARNING" else if (s.wheelWellLevel > 0.02) "COOLING" else "NORMAL"
    fun wheelWellChips(s: SimState): List<ChipData> {
        val g = gearAvg(s)
        return listOf(
            ChipData("GEAR", g > 0.98, if (g > 0.98) "DOWN LOCKED" else if (g < 0.02) "UP" else "IN TRANSIT"),
            ChipData("LEVER", s.gear == "DN", s.gear),
            ChipData("WELL FIRE", false, "${rnd(s.wheelWellLevel * 100)}%", warn = s.wheelWellFire),
            ChipData("HYD A (GEAR)", s.hydAPress > 1500, "${rnd(s.hydAPress)} PSI"),
        )
    }

    // ---- cargo ----
    fun cargoState(s: SimState, cfWarn: Boolean, caWarn: Boolean) =
        if (!s.cargoFireInstalled) "NOT INSTALLED (pre-SB 26A1081)" else if (cfWarn || caWarn) "SMOKE / FIRE DETECTED" else if (s.cargoBottleDischarged) "AGENT DISCHARGED" else "NORMAL"
    fun cargoTone(s: SimState, cfWarn: Boolean, caWarn: Boolean) =
        if (!s.cargoFireInstalled) "ok" else if (cfWarn || caWarn) "warn" else if (s.cargoBottleDischarged) "caution" else "ok"
    fun cargoChips(s: SimState): List<ChipData> {
        val inst = s.cargoFireInstalled
        return listOf(
            ChipData("FWD SMOKE", false, if (!inst) "N/A" else if (s.cargoFwdFire) "DETECTED" else "CLEAR", warn = s.cargoFwdFire && inst),
            ChipData("AFT SMOKE", false, if (!inst) "N/A" else if (s.cargoAftFire) "DETECTED" else "CLEAR", warn = s.cargoAftFire && inst),
            ChipData("ARM SWITCH", s.cargoArmed != "NONE", if (!inst) "N/A" else if (s.cargoArmed == "NONE") "OFF" else s.cargoArmed),
            ChipData("AGENT", inst && !s.cargoBottleDischarged, if (!inst) "N/A" else if (s.cargoBottleDischarged) "DISCHARGED" else "CHARGED"),
        )
    }

    // ---- warning strip ----
    /** Eight lamps + bell; [test] with DC power lights them all (web lit()). */
    fun warningLights(s: SimState, d: Derived, test: Boolean): List<Pair<String, Boolean>> {
        val dc = d.dcPower
        fun lit(real: Boolean) = real || (test && dc)
        val wwWarn = dc && s.wheelWellFire
        val cf = d.cargoFwdFireWarn
        val ca = d.cargoAftFireWarn
        return listOf(
            "FIRE WARN" to lit(d.fireWarn), "ENG 1" to lit(d.engine1FireWarn), "ENG 2" to lit(d.engine2FireWarn), "APU" to lit(d.apuFireWarn),
            "WHEEL WELL" to lit(wwWarn), "CARGO FWD" to lit(cf), "CARGO AFT" to lit(ca), "BELL" to (d.fireWarn || wwWarn || cf || ca),
        )
    }

    // ---- mitigation ----
    class Mitigation(val title: String, val steps: List<Pair<String, Boolean>>, val note: String?)

    fun anyFire(s: SimState): Boolean =
        s.faults.engineFire1 || s.faults.engineFire2 || s.faults.apuFireDetected || s.wheelWellFire || s.cargoFwdFire || s.cargoAftFire

    fun mitigation(s: SimState, d: Derived): List<Mitigation> {
        val out = ArrayList<Mitigation>()
        val anyBottle = s.fireBottleLDischarged || s.fireBottleRDischarged
        for (n in 1..2) {
            val e = eng(s, d, n)
            if (!e.fire && !e.pulled) continue
            out.add(Mitigation(
                "ENG $n FIRE / SEVERE DAMAGE",
                listOf(
                    "Thrust lever $n — CLOSE (retard to idle)" to (!e.lever || e.pulled),
                    "ENG $n FIRE handle — PULL (isolates fuel, bleed, generator, hydraulic supply)" to e.pulled,
                    "Rotate handle L or R — discharge a bottle" to anyBottle,
                    "If fire persists after 30 s — discharge the other bottle" to ((s.fireBottleLDischarged && s.fireBottleRDischarged) || (anyBottle && !e.fire)),
                    "ENG $n FIRE warning — OUT" to !e.fire,
                ),
                "After the fire is out: do not restart the engine, land at the nearest suitable airport, expect single-engine performance and loss of that generator, bleed and engine hydraulic pump.",
            ))
        }
        val apuFire = s.faults.apuFireDetected
        if (apuFire || s.apuFirePulled) out.add(Mitigation(
            "APU FIRE",
            listOf(
                "APU FIRE handle — PULL (APU shuts down automatically)" to s.apuFirePulled,
                "APU bottle — DISCHARGE" to s.apuBottleFired,
                "APU FIRE warning — OUT" to !apuFire,
            ),
            "On the ground, evacuate if the fire is not extinguished. In flight the APU is not used for the remainder of the flight.",
        ))
        val g = gearAvg(s)
        if (s.wheelWellFire || s.wheelWellLevel > 0.02) out.add(Mitigation(
            "WHEEL WELL FIRE",
            listOf(
                "Do NOT leave the gear retracted — fire builds in the closed well" to (g > 0.5),
                "Landing gear lever — DOWN (airflow cools / starves the fire)" to (s.gear == "DN"),
                "Gear down and locked" to (g > 0.98),
                "WHEEL WELL warning — OUT" to !s.wheelWellFire,
            ),
            "Leave the gear extended, land at the nearest suitable airport and expect hot brakes — do not set the parking brake.",
        ))
        if (s.cargoFwdFire || s.cargoAftFire || s.cargoFwdLevel > 0.15 || s.cargoAftLevel > 0.15) {
            val comp = if (s.cargoFwdFire || s.cargoFwdLevel >= s.cargoAftLevel) "FWD" else "AFT"
            out.add(Mitigation(
                "CARGO FIRE / SMOKE ($comp)",
                listOf(
                    "CARGO FIRE ARM — select $comp" to (s.cargoArmed == comp),
                    "CARGO FIRE DISCH — press (agent floods the armed compartment only)" to (s.cargoBottleDischarged && s.cargoArmed == comp),
                    "CARGO $comp warning — OUT" to !(if (comp == "FWD") s.cargoFwdFire else s.cargoAftFire),
                ),
                "Agent only reaches the compartment selected on the ARM switch — arm the wrong one and the fire keeps growing. Then land at the nearest suitable airport; cargo agent lasts a limited time.",
            ))
        }
        return out
    }

    /** "Effect of handle(s)" items. */
    fun lost(s: SimState, d: Derived): List<String> {
        val out = ArrayList<String>()
        if (s.engine1FirePulled) out.addAll(listOf("GEN 1 ${if (d.generator1BusPowered) "still on bus via bus tie" else "off bus"}", "HYD A pump 1 ${if (d.hydAPump1On) "on" else "no supply"}", "L bleed ${if (d.bleed1Available) "on" else "lost"}"))
        if (s.engine2FirePulled) out.addAll(listOf("GEN 2 ${if (d.generator2BusPowered) "still on bus via bus tie" else "off bus"}", "HYD A pump 2 ${if (d.hydAPump2On) "on" else "no supply"}", "R bleed ${if (d.bleed2Available) "on" else "lost"}"))
        if (s.apuFirePulled) out.addAll(listOf("APU gen off bus", "APU bleed lost"))
        return out
    }

    // ---- downstream power chips ----
    fun electricalChips(s: SimState, d: Derived) = listOf(
        ChipData("GEN 1 BUS", d.generator1BusPowered), ChipData("GEN 2 BUS", d.generator2BusPowered),
        ChipData("APU GEN", d.apuGenOnBus), ChipData("BATT BUS", d.batteryBusPowered),
        ChipData("XFR BUS 1", d.transferBus1Powered), ChipData("XFR BUS 2", d.transferBus2Powered),
        ChipData("DC BUS 1", d.dcBus1Powered), ChipData("DC BUS 2", d.dcBus2Powered),
    )
    fun hydraulicChips(s: SimState, d: Derived) = listOf(
        ChipData("SYS A", s.hydAPress > 1500, "${rnd(s.hydAPress)} PSI"), ChipData("SYS B", s.hydBPress > 1500, "${rnd(s.hydBPress)} PSI"),
        ChipData("A PUMP 1 (ENG 1)", d.hydAPump1On), ChipData("A PUMP 2 (ENG 2)", d.hydAPump2On),
        ChipData("B PUMP 1 (ELEC)", d.hydBPump1On), ChipData("B PUMP 2 (ELEC)", d.hydBPump2On),
        ChipData("RESERVOIR A", s.hydAQty > 20, "${rnd(s.hydAQty)}%"), ChipData("RESERVOIR B", s.hydBQty > 20, "${rnd(s.hydBQty)}%"),
    )
    fun pneumaticChips(s: SimState, d: Derived) = listOf(
        ChipData("L MANIFOLD", d.leftManifold, if (d.leftManifold) "${rnd(d.leftDuctPsi)} PSI" else "OFF"),
        ChipData("R MANIFOLD", d.rightManifold, if (d.rightManifold) "${rnd(d.rightDuctPsi)} PSI" else "OFF"),
        ChipData("APU BLEED", apuBleedOn(s)), ChipData("ISOL VALVE", d.isolationOpen, if (d.isolationOpen) "OPEN" else "CLOSED"),
        ChipData("PACK L", d.packLFlow, if (d.packLFlow) "FLOW" else "OFF"), ChipData("PACK R", d.packRFlow, if (d.packRFlow) "FLOW" else "OFF"),
        ChipData("ENG 1 BLEED", d.bleed1Available), ChipData("ENG 2 BLEED", d.bleed2Available),
    )

    // ---- flame / mist geometry ----
    /** One flame: outer and inner bezier outlines as [x0,y0, c1x,c1y,c2x,c2y,x1,y1, c3x,c3y,c4x,c4y,x2,y2] (two cubics) plus the opacity cycle periods. */
    class Flame(val outer: DoubleArray, val inner: DoubleArray, val outerDur: Double, val innerDur: Double)

    fun flames(cx: Double, base: Double, size: Double, n: Int = 3, spread: Double = 1.0): List<Flame> {
        val w = size * 0.42
        return List(n) { i ->
            val dx = (i - (n - 1) / 2.0) * w * 1.15 * spread
            val h = size * (if (i % 2 == 1) 0.8 else 1.0)
            val x = cx + dx
            Flame(
                doubleArrayOf(x - w, base, x - w * 1.3, base - h * 0.4, x - w * 0.1, base - h * 0.55, x, base - h, x + w * 0.2, base - h * 0.55, x + w * 1.3, base - h * 0.4, x + w, base),
                doubleArrayOf(x - w * 0.5, base, x - w * 0.65, base - h * 0.3, x, base - h * 0.35, x, base - h * 0.62, x + w * 0.1, base - h * 0.35, x + w * 0.65, base - h * 0.3, x + w * 0.5, base),
                0.45 + i * 0.13, 0.38 + i * 0.11,
            )
        }
    }

    /** Mist puff i: centre offset and radius as in the web Mist (5 circles). Returns [cx, cy, r]. */
    fun mistPuff(cx: Double, cy: Double, r: Double, i: Int): DoubleArray =
        doubleArrayOf(cx + (i - 2) * r * 0.55, cy + (if (i % 2 == 1) -1 else 1) * r * 0.25, r * (0.5 + (i % 3) * 0.18))

    /** SVG `<animate values="a;b;a" dur>`: linear there and back. */
    fun sweep(tSec: Double, dur: Double, a: Double, b: Double): Double {
        val p = (tSec % dur) / dur
        return a + (b - a) * (1 - abs(1 - 2 * p))
    }

    const val FOOTNOTE = "Training visualization: the engine and APU pictures are the same live models as the Engine Start and APU panels. Pulling a fire handle isolates that unit's fuel, generator, hydraulic pump supply and bleed air; bottles are shared between engines; cargo agent only reaches the compartment selected on the ARM switch; a wheel well fire builds with the gear retracted and is cooled by extending it. Simplified — not an aircraft checklist."
    fun emptyMitigationText(s: SimState) = (if (anyFire(s)) "Fire active." else "No fire. Inject one on any unit above, or pull a handle to see what it isolates.") + " The steps and the effect on power appear here."

}
