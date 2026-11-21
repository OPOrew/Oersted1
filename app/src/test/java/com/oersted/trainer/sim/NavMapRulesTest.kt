package com.oersted.trainer.sim

import com.oersted.trainer.sim.NavMapRules as M
import com.oersted.trainer.sim.RouteSequence.SequenceItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NavMapRulesTest {
    @Test fun mercatorRoundTripAndKnownPoints() {
        assertEquals(128.0, M.worldX(0.0, 0.0), 1e-9); assertEquals(128.0, M.worldY(0.0, 0.0), 1e-9)
        assertEquals(256.0 * 64, M.scale(6.0), 1e-9)
        for ((lat, lon) in listOf(14.5085 to 121.0195, 1.3644 to 103.9915, -33.9 to 151.2)) {
            for (z in listOf(0.0, 6.0, 12.0)) {
                assertEquals(lat, M.latOf(M.worldY(lat, z), z), 1e-7); assertEquals(lon, M.lonOf(M.worldX(lon, z), z), 1e-7)
            }
        }
        // metres per pixel at the equator, zoom 0
        assertEquals(156543.03392, M.metersPerPixel(0.0, 0.0), 1e-3)
        assertEquals(156543.03392 * Math.cos(Math.toRadians(14.5)) / 64, M.metersPerPixel(14.5, 6.0), 1e-3)
    }

    @Test fun fitBoundsPicksLargestFittingIntegerZoomCappedAtEight() {
        val rpll = M.LatLon(14.5086, 121.0194); val wsss = M.LatLon(1.3644, 103.9915)
        val v = M.fitBounds(listOf(rpll, wsss), 360.0, 480.0)!!
        // width of the bounds at zoom 0 = (121.0194-103.9915)/360*256 = 12.1 px; available 300 px -> log2(24.7) = 4.6 -> zoom 4
        assertEquals(4, v.zoom)
        assertEquals((14.5086 + 1.3644) / 2, v.lat, 2.0); assertEquals((121.0194 + 103.9915) / 2, v.lon, 1e-6)
        assertEquals(8, M.fitBounds(listOf(rpll, M.LatLon(14.52, 121.03)), 360.0, 480.0)!!.zoom)
        assertEquals(8, M.fitBounds(listOf(rpll, rpll), 360.0, 480.0)!!.zoom)
        assertEquals(null, M.fitBounds(emptyList(), 360.0, 480.0))
        assertEquals("14.50860,121.01940|1.36440,103.99150", M.fitKey(listOf(rpll, wsss)))
    }

    @Test fun tilesCoverTheViewportAndWrap() {
        val t = M.tilesFor(14.5085, 121.0195, 6, 360.0, 480.0)
        assertTrue(t.isNotEmpty()); assertTrue(t.all { it.z == 6 && it.x in 0..63 && it.y in 0..63 })
        val cx = M.worldX(121.0195, 6.0); val cy = M.worldY(14.5085, 6.0)
        val centre = t.first { cx >= it.x * 256 && cx < it.x * 256 + 256 && cy >= it.y * 256 && cy < it.y * 256 + 256 }
        assertEquals(centre.x * 256.0 - (cx - 180.0), centre.left, 1e-6)
        val wrap = M.tilesFor(0.0, 179.9, 2, 600.0, 200.0)
        assertTrue(wrap.map { it.x }.toSet().containsAll(listOf(0, 3)))
        assertEquals("https://tile.openstreetmap.org/6/52/29.png", M.tileUrl(M.OSM_URL, 6, 52, 29))
        assertEquals("https://h/v2/radar/x/256/{z}/{x}/{y}/2/1_1.png", M.radarTileTemplate("https://h", "/v2/radar/x"))
    }

    @Test fun distanceAndExtrapolation() {
        assertEquals(60.0, M.distanceNmBetween(0.0, 0.0, 1.0, 0.0), 0.2)
        val still = M.extrapolate(14.0, 121.0, 0.5, 1.0, 90.0, 90.0, 0.0, 0.5)
        assertEquals(M.LatLon(14.0, 121.0), still)
        // 100 kt due east for 0.5 s: 25.7 m -> ~0.000238 deg of longitude
        val e = M.extrapolate(0.0, 100.0, 100.0, null, 90.0, 0.0, null, 5.0)   // dt is capped at 0.5 s
        assertEquals(0.0, e.lat, 1e-9); assertEquals(100.0 + 100 * 0.514444 * 0.5 / 111320.0, e.lon, 1e-9)
        val c = M.extrapolate(0.0, 100.0, 100.0, 15.0, 0.0, 0.0, null, 0.5)     // north with 15x time compression
        assertEquals(100 * 0.514444 * 15 * 0.5 / 111320.0, c.lat, 1e-9)
        assertEquals(45.0, M.symbolDeg(null, 40.0, 5.0), 1e-9); assertEquals(350.0, M.symbolDeg(350.0, 40.0, 5.0), 1e-9)
    }

    private fun seq() = listOf(
        SequenceItem("a", "ALPHA VOR", 14.0, 121.0, 112.2, "VOR"),
        SequenceItem("b", "BRAVO NDB", 13.0, 121.0, 353.4, "NDB"),
        SequenceItem("c", "CHARLIE ILS", 1.0, 104.0, 110.9, "ILS", courseMag = 23.0),
    )

    @Test fun autoTuneHandoffs() {
        assertEquals(M.Tune.None, M.autoTune(20.0, 121.0, 0, seq(), false))           // far from the first station
        val adf = M.autoTune(14.01, 121.0, 0, seq(), false) as M.Tune.Adf             // reached ALPHA -> next is the NDB
        assertEquals(353, adf.kHz); assertEquals(1, adf.index); assertTrue(adf.status.startsWith("Auto-tuned ADF to 353 kHz (BRAVO NDB) · 0.6 NM"))
        val nav = M.autoTune(13.01, 121.0, 1, seq(), false) as M.Tune.Nav1
        assertEquals(2, nav.index); assertEquals(110.9, nav.mhz, 0.0); assertTrue(nav.status.startsWith("Auto-tuned NAV1 to 110.90 (CHARLIE ILS)"))
        assertEquals(M.Tune.None, M.autoTune(14.01, 121.0, 0, seq(), true))           // manual tuning pauses the handoff
        assertEquals(M.Tune.None, M.autoTune(1.0, 104.0, 2, seq(), false))            // end of sequence
    }

    @Test fun textHelpers() {
        val s = seq()
        assertEquals("—", M.frequencyText(null)); assertEquals("353 kHz", M.frequencyText(s[1])); assertEquals("112.20 MHz", M.frequencyText(s[0]))
        assertEquals("RPLL → WSSS", M.routeLabel(null, null)); assertEquals("RPLL → RPVM", M.routeLabel("RPLL", "RPVM"))
        assertEquals("—", M.rangeText(null)); assertEquals("12.3 NM", M.rangeText(12.34))
        assertEquals("Awaiting route", M.currentTargetName(null, false)); assertEquals("No VOR / NDB / ILS in plan", M.currentTargetName(null, true))
        assertEquals("END OF SEQUENCE", M.nextTargetName(null, 3)); assertEquals("—", M.nextTargetName(null, 0))
        assertEquals("-1.0", M.xtkText(88.0, 90.0)); assertEquals("0.0", M.xtkText(88.0, null))
        assertEquals("WAITING FOR TELEMETRY", M.statusText(false, 0.0)); assertEquals("PARKED · WAITING FOR TAKEOFF", M.statusText(true, 0.5)); assertEquals("MOVING WITH SIM", M.statusText(true, 5.0))
        assertEquals(listOf("WP 2 · FOO", "14.50850, 121.01950", "5000 ft · No speed constraint"), M.waypointPopup(1, "FOO", 14.5085, 121.0195, 5000.0, 0.0))
        assertEquals("250 kt", M.waypointPopup(0, "X", 0.0, 0.0, 0.0, 250.0)[2].substringAfter("· "))
        assertEquals(listOf("BRAVO NDB", "353.4 kHz · NDB"), M.stationPopup(s[1])); assertEquals("110.9 MHz · ILS", M.stationPopup(s[2])[1])
        assertEquals(listOf("Aircraft", "HDG ---° · TRK 90°T", "ALT --- ft"), M.aircraftPopup(null, 90.0, null))
        assertEquals("RPLL,RPLC,WSSS,RPVM,RPVP,RPSP,RPVB,WMKK,VTBS,VVTS".split(",").toSet(), M.weatherIds("RPLL", "WSSS").split(",").toSet())
        assertEquals("RPLL,WSSS", M.weatherIds("RPLL", "WSSS").split(",").take(2).joinToString(","))
        assertNotNull(NavaidsChangi.CHANGI_NAVAIDS.firstOrNull { it.available }?.let { M.catalogPopup(it) })
    }
}
