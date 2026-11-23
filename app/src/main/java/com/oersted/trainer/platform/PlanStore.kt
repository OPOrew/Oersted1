package com.oersted.trainer.platform

import android.content.Context
import com.oersted.trainer.sim.ActiveArrival
import com.oersted.trainer.sim.ActiveFlightWaypoint
import com.oersted.trainer.sim.ActiveIls
import com.oersted.trainer.sim.FlightPlanDraft
import org.json.JSONArray
import org.json.JSONObject

/**
 * Keeps the PLAN draft on this device, the Android side of the web's localStorage "oersted-flight-plan-v1".
 * A missing or unreadable value gives the default draft, as the web does. Not compiled in the sandbox.
 */
class PlanStore(context: Context) {
    private val prefs = context.getSharedPreferences("oersted-flight-plan", Context.MODE_PRIVATE)

    /** True when a plan was saved before (web: localStorage item present). */
    fun exists(): Boolean = prefs.getString(KEY, null) != null

    fun load(): FlightPlanDraft {
        val raw = prefs.getString(KEY, null) ?: return FlightPlanDraft()
        return try {
            val o = JSONObject(raw)
            val d = FlightPlanDraft()
            FlightPlanDraft(
                callsign = o.optString("callsign", d.callsign),
                departure = o.optString("departure", d.departure),
                destination = o.optString("destination", d.destination),
                alternate = o.optString("alternate", d.alternate),
                departureRunway = o.optString("departureRunway", d.departureRunway),
                arrivalRunway = o.optString("arrivalRunway", d.arrivalRunway),
                cruiseAltitudeFt = o.optDouble("cruiseAltitudeFt", d.cruiseAltitudeFt),
                cruiseSpeedKt = o.optDouble("cruiseSpeedKt", d.cruiseSpeedKt),
                waypoints = readWaypoints(o.optJSONArray("waypoints")),
                arrival = o.optJSONObject("arrival")?.let { readArrival(it) },
                sid = o.optString("sid", d.sid),
                enrouteRoute = o.optString("enrouteRoute", d.enrouteRoute),
                star = o.optString("star", d.star),
                approach = o.optString("approach", d.approach),
                procedureStatus = o.optString("procedureStatus", d.procedureStatus),
                routeText = o.optString("routeText", d.routeText),
                reserveFuelLb = o.optDouble("reserveFuelLb", d.reserveFuelLb),
                cruiseTopOfClimbNm = o.optDouble("cruiseTopOfClimbNm", d.cruiseTopOfClimbNm),
                descentStartNm = o.optDouble("descentStartNm", d.descentStartNm),
                approachAltitudeFt = o.optDouble("approachAltitudeFt", d.approachAltitudeFt),
                ils = o.optJSONObject("ils")?.let { readIls(it) },
                timeCompression = o.optDouble("timeCompression", d.timeCompression),
                destinationKind = o.optString("destinationKind", d.destinationKind),
                destinationLat = if (o.has("destinationLat")) o.optDouble("destinationLat") else d.destinationLat,
                destinationLon = if (o.has("destinationLon")) o.optDouble("destinationLon") else d.destinationLon,
            )
        } catch (e: Exception) {
            FlightPlanDraft()
        }
    }

    fun save(d: FlightPlanDraft) {
        val o = JSONObject()
            .put("callsign", d.callsign)
            .put("departure", d.departure)
            .put("destination", d.destination)
            .put("alternate", d.alternate)
            .put("departureRunway", d.departureRunway)
            .put("arrivalRunway", d.arrivalRunway)
            .put("cruiseAltitudeFt", d.cruiseAltitudeFt)
            .put("cruiseSpeedKt", d.cruiseSpeedKt)
            .put("waypoints", JSONArray().apply { d.waypoints.forEach { put(writeWaypoint(it)) } })
            .put("sid", d.sid).put("enrouteRoute", d.enrouteRoute).put("star", d.star).put("approach", d.approach)
            .put("procedureStatus", d.procedureStatus).put("routeText", d.routeText).put("reserveFuelLb", d.reserveFuelLb)
            .put("cruiseTopOfClimbNm", d.cruiseTopOfClimbNm).put("descentStartNm", d.descentStartNm)
            .put("approachAltitudeFt", d.approachAltitudeFt).put("timeCompression", d.timeCompression)
            .put("destinationKind", d.destinationKind)
            .apply {
                d.arrival?.let { put("arrival", writeArrival(it)) }
                d.ils?.let { put("ils", writeIls(it)) }
                d.destinationLat?.let { put("destinationLat", it) }
                d.destinationLon?.let { put("destinationLon", it) }
            }
        prefs.edit().putString(KEY, o.toString()).apply()
    }

    private fun readWaypoints(a: JSONArray?): List<ActiveFlightWaypoint> {
        if (a == null) return emptyList()
        return (0 until a.length()).map { i ->
            val w = a.getJSONObject(i)
            ActiveFlightWaypoint(
                id = w.getString("id"), name = w.getString("name"),
                latitude = w.getDouble("latitude"), longitude = w.getDouble("longitude"),
                altitudeFt = w.getDouble("altitudeFt"), speedKt = w.getDouble("speedKt"),
            )
        }
    }

    private fun writeWaypoint(w: ActiveFlightWaypoint): JSONObject = JSONObject()
        .put("id", w.id).put("name", w.name).put("latitude", w.latitude).put("longitude", w.longitude)
        .put("altitudeFt", w.altitudeFt).put("speedKt", w.speedKt)

    private fun readArrival(o: JSONObject): ActiveArrival = ActiveArrival(
        airport = o.getString("airport"), runway = o.getString("runway"), sceneId = o.getString("sceneId"),
        firstFixName = o.getString("firstFixName"), lastFixName = o.getString("lastFixName"),
        ilsFrequencyMHz = o.getDouble("ilsFrequencyMHz"), courseMag = o.getDouble("courseMag"),
    )

    private fun writeArrival(a: ActiveArrival): JSONObject = JSONObject()
        .put("airport", a.airport).put("runway", a.runway).put("sceneId", a.sceneId)
        .put("firstFixName", a.firstFixName).put("lastFixName", a.lastFixName)
        .put("ilsFrequencyMHz", a.ilsFrequencyMHz).put("courseMag", a.courseMag)

    private fun readIls(o: JSONObject): ActiveIls = ActiveIls(
        id = o.getString("id"), ident = o.getString("ident"), name = o.getString("name"), airport = o.getString("airport"),
        runway = o.getString("runway"), frequencyMHz = o.getDouble("frequencyMHz"), courseMag = o.getDouble("courseMag"),
        latitude = o.getDouble("latitude"), longitude = o.getDouble("longitude"),
    )

    private fun writeIls(i: ActiveIls): JSONObject = JSONObject()
        .put("id", i.id).put("ident", i.ident).put("name", i.name).put("airport", i.airport).put("runway", i.runway)
        .put("frequencyMHz", i.frequencyMHz).put("courseMag", i.courseMag).put("latitude", i.latitude).put("longitude", i.longitude)

    /** Web resetPlan: localStorage.removeItem. */
    fun clear() { prefs.edit().remove(KEY).apply() }

    private companion object {
        const val KEY = "draft-v1"
    }
}
