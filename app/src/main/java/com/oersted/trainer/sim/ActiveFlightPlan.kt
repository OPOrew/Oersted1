package com.oersted.trainer.sim

/**
 * Port of the data types and the pure cap logic from src/lib/sim/activeFlightPlan.ts and
 * src/lib/sim/flightLevelCap.ts (applyFlightLevelCap).
 *
 * Not ported here: publishActiveFlightPlan, readActiveFlightPlan and the React hook. Those read and
 * write localStorage and dispatch events, so they belong in the Android storage layer (JSON via
 * kotlinx-serialization, SharedPreferences or DataStore). The storage key is kept for parity.
 */
object ActiveFlightPlanStore {
    const val KEY = "oersted-active-flight-plan-v1"
    const val EVENT = "oersted-active-flight-plan-updated"
}

data class ActiveFlightWaypoint(
    val id: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val altitudeFt: Double,
    val speedKt: Double,
)

/** Vectored (non-RNAV) arrival to an ILS: VCT-A/B/C stand in for ATC vectors; the ILS takes over from the last fix. */
data class ActiveArrival(
    val kind: String = "vector-ils",
    val airport: String,
    val runway: String,
    /** ILS scene id (see radionav.ts) */
    val sceneId: String,
    val firstFixName: String,
    val lastFixName: String,
    val ilsFrequencyMHz: Double,
    val courseMag: Double,
)

/** ILS / localizer chosen in the planner as the approach guidance source. It is NOT a route endpoint. */
data class ActiveIls(
    /** navaid catalog id, e.g. "WSSS-ILS-02L" */
    val id: String,
    val ident: String,
    val name: String,
    val airport: String,
    val runway: String,
    val frequencyMHz: Double,
    val courseMag: Double,
    /** localizer antenna position */
    val latitude: Double,
    val longitude: Double,
)

data class ActiveFlightPlan(
    val version: Int = 1,
    val activatedAt: String,
    val callsign: String,
    val departure: String,
    val destination: String,
    val alternate: String,
    val departureRunway: String,
    val arrivalRunway: String,
    val cruiseAltitudeFt: Double,
    val cruiseSpeedKt: Double,
    val sid: String,
    val enrouteRoute: String,
    val star: String,
    val approach: String,
    /** "unverified" or "chart-checked" */
    val procedureStatus: String,
    val waypoints: List<ActiveFlightWaypoint>,
    /** present for a vectored ILS arrival */
    val arrival: ActiveArrival? = null,
    /** En-route position-time multiplier (1 = real time). Defaults to 15 when absent. */
    val timeCompression: Double? = null,
    /** ILS / localizer selected for the approach */
    val ils: ActiveIls? = null,
)

object ActiveFlightPlanLogic {
    /** TS readActiveFlightPlan validity check: version 1 with a departure and a destination. */
    fun isUsable(plan: ActiveFlightPlan): Boolean =
        plan.version == 1 && plan.departure.isNotEmpty() && plan.destination.isNotEmpty()

    /**
     * TS applyFlightLevelCap: when [capFt] is set, cruise and waypoint altitudes above it are held at
     * it. The stored plan is never changed; the caller gets a copy back.
     */
    fun applyFlightLevelCap(plan: ActiveFlightPlan, capFt: Double?): ActiveFlightPlan {
        if (capFt == null) return plan
        val needs = plan.cruiseAltitudeFt > capFt || plan.waypoints.any { it.altitudeFt > capFt }
        if (!needs) return plan
        return plan.copy(
            cruiseAltitudeFt = minOf(plan.cruiseAltitudeFt, capFt),
            waypoints = plan.waypoints.map { if (it.altitudeFt > capFt) it.copy(altitudeFt = capFt) else it },
        )
    }
}

/**
 * Port of the constants and the commit rule of src/lib/sim/flightLevelCap.ts and FlightLevelInput (FlightPhasePanel.tsx).
 * Simulation-only maximum flight level: a CEILING on the plan's cruise and waypoint altitudes. The storage and the event
 * bus stay on the Android side (CockpitModel); the cap is applied with [ActiveFlightPlanLogic.applyFlightLevelCap].
 */
object FlightLevelCap {
    const val FL_CAP_MIN = 10
    const val FL_CAP_MAX = 410

    /** TS readFlightLevelCapFt / setFlightLevelCap validation: a finite flight level in range, rounded; anything else clears the cap. */
    fun validFl(fl: Double?): Int? =
        if (fl != null && fl.isFinite() && fl >= FL_CAP_MIN && fl <= FL_CAP_MAX) Math.round(fl).toInt() else null

    /** Cap in feet for a stored flight level, or null (TS readFlightLevelCapFt). */
    fun capFt(fl: Int?): Double? = fl?.let { validFl(it.toDouble()) }?.let { it * 100.0 }

    /** The result of leaving the field (TS FlightLevelInput commit). */
    sealed class Commit {
        /** Empty text: the cap is cleared. */
        object Clear : Commit()
        /** A valid FL (e.g. 350). */
        data class Set(val fl: Int) : Commit()
        /** Not a number or out of range: the stored cap is left as it was. */
        object Ignore : Commit()
    }

    /** TS commit: trim, drop a leading "FL", empty clears, a number in FL_CAP_MIN..FL_CAP_MAX sets, anything else is ignored. */
    fun commit(text: String): Commit {
        val t = text.trim().replace(Regex("^fl", RegexOption.IGNORE_CASE), "")
        if (t == "") return Commit.Clear
        val n = t.toDoubleOrNull()   // JS Number("1e2") parses as well; Number("") was handled above
        val fl = validFl(n) ?: return Commit.Ignore
        return Commit.Set(fl)
    }
}
