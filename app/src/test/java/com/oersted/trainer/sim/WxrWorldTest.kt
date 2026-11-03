package com.oersted.trainer.sim

import com.oersted.trainer.sim.WxrWorld.LiveWxHolder
import com.oersted.trainer.sim.WxrWorld.WxrNav
import com.oersted.trainer.sim.WxrWorld.WxrNavHolder
import com.oersted.trainer.sim.WxrWorld.beamFactor
import com.oersted.trainer.sim.WxrWorld.intensityFromRgb
import com.oersted.trainer.sim.WxrWorld.turbulenceFromIntensity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WxrWorldTest {
    @Test fun beamFactorFullAtCellMidHeight() {
        assertEquals(1.0, beamFactor(0.0, 0.0, 20500.0), 1e-9)
    }

    @Test fun beamFactorZeroWhenBeamMissesStorm() {
        assertEquals(0.0, beamFactor(0.0, 0.0, 41500.0), 1e-9)
        assertTrue(beamFactor(0.0, 0.0, 0.0) < 0.05)
    }

    @Test fun beamFactorHalfAtTenThousandFeet() {
        assertEquals(0.5, beamFactor(0.0, 0.0, 10000.0), 1e-9)
    }

    @Test fun tiltRaisesTheBeamAtRange() {
        // 10000 ft plus 10 nm at 10 deg tilt is about 20715 ft, close to the 20500 ft centre
        assertTrue(beamFactor(10.0, 10.0, 10000.0) > 0.98)
    }

    @Test fun sceneTablesHaveExpectedSizes() {
        assertEquals(8, WxrWorld.WX_CELLS.size)
        assertEquals(9, WxrWorld.WX_COAST.size)
        assertEquals(3, WxrWorld.WX_CITIES.size)
    }

    @Test fun intensityClampsToZeroOneRange() {
        assertEquals(0.0, intensityFromRgb(0.0, 0.0, 0.0), 1e-9)
        assertEquals(1.0, intensityFromRgb(255.0, 200.0, 0.0), 1e-9)
    }

    @Test fun turbulenceBands() {
        assertEquals(0.0, turbulenceFromIntensity(0.1), 1e-9)
        assertEquals(0.25, turbulenceFromIntensity(0.15), 1e-9)
        assertEquals(0.55, turbulenceFromIntensity(0.5), 1e-9)
        assertEquals(0.85, turbulenceFromIntensity(0.9), 1e-9)
    }

    @Test fun navHolderStartsAtRadioNavStart() {
        val h = WxrNavHolder()
        assertEquals(RadioNav.NAV_START_X, h.state.x, 1e-9)
        assertEquals(62.0, h.state.hdg, 1e-9)
        h.publish(WxrNav(1.0, 2.0, 3.0))
        assertEquals(2.0, h.state.y, 1e-9)
    }

    @Test fun liveWeatherFlagsFollowIntensity() {
        val h = LiveWxHolder()
        h.setLiveWeather(emptyList(), 0.5)
        assertTrue(h.state.inWeather && !h.state.thunderstorm)
        h.setLiveWeather(emptyList(), 0.8)
        assertTrue(h.state.thunderstorm)
        h.setLiveWeather(emptyList(), 0.1)
        assertTrue(!h.state.inWeather)
    }
}
