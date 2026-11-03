package com.oersted.trainer.sim

import com.oersted.trainer.sim.RadioNavChangi.computeChangiRadioNav
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.PI

class RadioNavChangiTest {
    /** Test-only destination point (standard spherical formula, independent of the code under test). */
    private fun dest(lat: Double, lon: Double, brgDeg: Double, distNm: Double): Pair<Double, Double> {
        val r = 3440.065
        val d = distNm / r
        val th = brgDeg * PI / 180
        val p1 = lat * PI / 180
        val l1 = lon * PI / 180
        val p2 = asin(sin(p1) * cos(d) + cos(p1) * sin(d) * cos(th))
        val l2 = l1 + atan2(sin(th) * sin(d) * cos(p1), cos(d) - sin(p1) * sin(p2))
        return Pair(p2 * 180 / PI, l2 * 180 / PI)
    }

    @Test fun unknownFrequencyIsEmpty() {
        val s = computeChangiRadioNav(1.0, 104.0, 0.0, 999.0, "VOR")
        assertTrue(!s.valid && s.navaid == null)
        assertEquals(999.0, s.frequency, 1e-9)
    }

    @Test fun vorInRangeGivesRadialAndDeviation() {
        // Tekong VTK 116.5 at (1.4153, 104.0222). Aircraft 10 NM east of it: radial FROM the station is ~90.
        val vtk = NavaidsChangi.CHANGI_NAVAIDS.first { it.ident == "VTK" }
        val (lat, lon) = dest(vtk.lat, vtk.lon, 90.0, 10.0)
        val s = computeChangiRadioNav(lat, lon, 0.0, 116.5, "VOR", 90.0)
        assertTrue(s.vorValid)
        assertEquals(10.0, s.distanceNm, 0.05)
        assertEquals(90.0 - vtk.magVarDeg, s.radialFrom, 0.1)
        assertTrue(s.toFlag)
    }

    @Test fun vorOutOfRangeIsInvalidButKeepsNavaid() {
        val vtk = NavaidsChangi.CHANGI_NAVAIDS.first { it.ident == "VTK" }
        val (lat, lon) = dest(vtk.lat, vtk.lon, 90.0, 300.0) // VTK range is 200 NM
        val s = computeChangiRadioNav(lat, lon, 0.0, 116.5, "VOR", 90.0)
        assertTrue(!s.valid && !s.vorValid)
        assertTrue(s.navaid?.ident == "VTK")
        assertEquals(300.0, s.distanceNm, 0.5)
    }

    @Test fun ilsOnCentrelineAtEightNmHasZeroDeviation() {
        // ICW 110.9, courseMag 23: approach from the reciprocal bearing, 8 NM out.
        val icw = NavaidsChangi.CHANGI_NAVAIDS.first { it.ident == "ICW" }
        val courseTrue = icw.courseMag!! + icw.magVarDeg
        val (lat, lon) = dest(icw.lat, icw.lon, (courseTrue + 180) % 360, 8.0)
        val altFt = (icw.elevFt ?: 20.0) + Math.tan(3.0 * PI / 180) * 8.0 * 6076.12
        val s = computeChangiRadioNav(lat, lon, altFt, 110.9, "ILS", 23.0)
        assertTrue(s.locValid)
        assertTrue(s.gsValid)
        assertEquals(0.0, s.locDevDeg, 0.1)
        assertEquals(0.0, s.gsDevDeg, 0.1)
    }

    @Test fun ilsGlideSlopeNotValidOnGround() {
        val icw = NavaidsChangi.CHANGI_NAVAIDS.first { it.ident == "ICW" }
        val courseTrue = icw.courseMag!! + icw.magVarDeg
        val (lat, lon) = dest(icw.lat, icw.lon, (courseTrue + 180) % 360, 8.0)
        val s = computeChangiRadioNav(lat, lon, 20.0, 110.9, "ILS", 23.0)
        assertTrue(s.locValid)
        assertTrue(!s.gsValid) // angle is below 0.5 deg
    }

    @Test fun pedestalFreqScaling() {
        assertEquals(109.95, RadioNavChangi.pedestalFreqToMHz(109950.0), 1e-9)
    }
}
