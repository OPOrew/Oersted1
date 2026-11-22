package com.oersted.trainer.sim

/**
 * Handler rules behind the Hydraulics panel of the trainer (routes/cockpit.tsx HydraulicsTrainerPanel, the switch row).
 * Each function returns the new state. The view keeps the flow drawing and the status text.
 * The ground-servicing switches are enabled only on the ground (weight on wheels), as in the web.
 */
object HydraulicTrainerRules {
    /** Pump and interconnect switches that are plain flips in the web panel. */
    val FLIP_KEYS: List<String> = listOf(
        "engHyd1", "engHyd2", "elecHyd1", "elecHyd2", "groundInterconnect", "hydServicingConnected", "hydGroundPowerConnected",
    )

    /** Standby hydraulic pump modes, in web order. */
    val STBY_MODES: List<String> = listOf("OFF", "AUTO", "ON")

    private inline fun edited(s: SimState, edit: SimState.() -> Unit): SimState {
        val c = s.copy()
        c.edit()
        return c
    }

    /** Web toggle(key, value) for the switches in [FLIP_KEYS]. An unknown key is refused. */
    fun toggle(s: SimState, key: String): SimState {
        val on = when (key) {
            "engHyd1" -> !s.engHyd1
            "engHyd2" -> !s.engHyd2
            "elecHyd1" -> !s.elecHyd1
            "elecHyd2" -> !s.elecHyd2
            "groundInterconnect" -> !s.groundInterconnect
            "hydServicingConnected" -> !s.hydServicingConnected
            "hydGroundPowerConnected" -> !s.hydGroundPowerConnected
            else -> throw IllegalArgumentException("not a hydraulic switch: $key")
        }
        return edited(s) {
            when (key) {
                "engHyd1" -> engHyd1 = on
                "engHyd2" -> engHyd2 = on
                "elecHyd1" -> elecHyd1 = on
                "elecHyd2" -> elecHyd2 = on
                "groundInterconnect" -> groundInterconnect = on
                "hydServicingConnected" -> hydServicingConnected = on
                else -> hydGroundPowerConnected = on
            }
        }
    }

    /** Web STBY HYD selector. */
    fun setStbyHyd(s: SimState, mode: String): SimState = edited(s) { stbyHyd = mode }

    /** Web ELEC 1 / ELEC 2 pumps are enabled only when that AC transfer bus is powered. */
    fun elecPumpEnabled(d: Derived, engine: Int): Boolean = if (engine == 1) d.transferBus1Powered else d.transferBus2Powered

    /** Web HAND PUMP / GPMU / air cart switches are enabled only on the ground. */
    fun groundServicingEnabled(s: SimState): Boolean = s.wow

    /** Web GND AIR CART: connecting it supplies 45 psi, disconnecting drops to 0. */
    fun toggleGroundAirCart(s: SimState): SimState {
        val next = !s.groundPneumaticConnected
        return edited(s) {
            groundPneumaticConnected = next
            groundPneumaticPsi = if (next) 45.0 else 0.0
        }
    }

    /** Web GND INTERCONNECT label: OPEN when the switch is on. */
    fun interconnectState(on: Boolean): String = if (on) "OPEN" else "CLOSED"

    // ── HydraulicTrainerSwitch strip (web "P5 / Trainer controls" box, below the flow drawing) ──

    /** Web interconnectActual: valve is only really open with GPMU connected, on the ground, parking brake set. */
    fun interconnectActual(s: SimState): Boolean = s.groundInterconnect && s.hydGroundPowerConnected && s.wow && s.parkingBrake

    /** Web HydraulicTrainerSwitch: a state other than OFF / CLOSED / DISCONNECTED lights the switch. */
    fun switchLive(state: String): Boolean = state != "OFF" && state != "CLOSED" && state != "DISCONNECTED"

    /** Web ELEC n PUMP detail line. */
    fun elecPumpDetail(busPowered: Boolean, pumpOn: Boolean, engine: Int): String =
        if (busPowered) (if (pumpOn) "SYSTEM B · RUNNING" else "SYSTEM B · NOT RUNNING") else "NO AC BUS $engine"

    fun interconnectDetail(actual: Boolean): String = if (actual) "B → A LIVE" else "GROUND"
    fun servicingDetail(wow: Boolean): String = if (wow) "HAND PUMP · HYD FLUID" else "AIRBORNE"
    fun gpmuDetail(wow: Boolean): String = if (wow) "GPMU · PRESSURE / RETURN" else "GROUND ONLY"
    fun airCartDetail(wow: Boolean): String = if (wow) "RES PRESS · WHEN NO N₂ · ALSO R MANIFOLD" else "GROUND ONLY"
    fun connectedState(on: Boolean): String = if (on) "CONNECTED" else "DISCONNECTED"

    /** Web "A · 3000 PSI" pressure chip text (Math.round semantics). */
    fun pressureText(label: String, psi: Double): String = "$label · ${Math.floor(psi + 0.5).toLong()} PSI"
}
