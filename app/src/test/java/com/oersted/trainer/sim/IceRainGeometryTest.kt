package com.oersted.trainer.sim

import com.oersted.trainer.sim.IceRainGeometry as G
import org.junit.Assert.assertEquals
import org.junit.Test

class IceRainGeometryTest {
    @Test fun leftWindowsAreMirroredAboutTheCentreLine() {
        assertEquals(G.MX - 1093.0, G.winPts("L", "1")[0].first, 0.0)
        assertEquals(491.0, G.winPts("L", "1")[0].second, 0.0)
        assertEquals(G.WIN_R.getValue("4"), G.winPts("R", "4"))
    }

    @Test fun centroidOfNo1Window() {
        val c = G.centroid(G.winPts("R", "1"))
        assertEquals(1126.25, c.first, 1e-9); assertEquals(504.75, c.second, 1e-9)
    }

    @Test fun heatColourSweepsAmberToRed() {
        assertEquals(Triple(255, 150, 40), G.heatRgb(100.0))
        assertEquals(Triple(255, 150, 40), G.heatRgb(20.0))
        assertEquals(Triple(255, 100, 30), G.heatRgb(122.5))
        assertEquals(Triple(255, 50, 20), G.heatRgb(145.0))
        assertEquals(Triple(255, 50, 20), G.heatRgb(300.0))
    }

    @Test fun glowAndVapour() {
        assertEquals(0.0, G.glow(45.0), 0.0); assertEquals(1.0, G.glow(110.0), 0.0); assertEquals(0.5, G.glow(77.5), 1e-9)
        assertEquals(4, G.vaporLines("1")); assertEquals(2, G.vaporLines("2")); assertEquals(1, G.vaporLines("4")); assertEquals(1, G.vaporLines("5"))
    }

    @Test fun slatBandsRiseWithIceAndMirror() {
        val b = G.slatBand(110.0, 630.0, 0.0)
        assertEquals(557 + 10 * 0.0886 - 2, b[0].second, 1e-9)
        assertEquals(557 + 530 * 0.0886 + 14, b[2].second, 1e-9)
        assertEquals(b[0].second - 9, G.frontSlatBand("R", 1.0)[0].second, 1e-9)
        assertEquals(G.MX - 110.0, G.frontSlatBand("L", 0.0)[0].first, 0.0)
    }

    @Test fun planLeadingEdgeAndMirror() {
        assertEquals(140.0, G.le(298.0), 1e-9); assertEquals(195.0, G.le(55.0), 1e-9)
        assertEquals(232.0, G.planX("L", 232.0), 0.0); assertEquals(408.0, G.planX("R", 232.0), 0.0)
        assertEquals(6, G.PROBE_XY.size); assertEquals(listOf("capt"), G.PROBE_XY[0].ids)
    }
}
