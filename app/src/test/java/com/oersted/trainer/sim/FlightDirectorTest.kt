package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightDirector.Inputs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FlightDirectorTest {
    private fun base(fdMode: Int = 2) = Inputs(
        power = true, fdMode = fdMode, fdUp = true, hdgBad = false, vorValid = false, locValid = false, captIsVor = false,
        lateralDev = 0.0, selCrs = 0.0, selHdg = 90.0, hdg = 90.0, roll = 0.0, pitch = 0.0, aoa = 3.0, flying = true,
        altFt = 0.0, gsCapFd = false, gsErr = 0.0, altFd = 0.0, fdAlt = false, fdPitch = 0.0,
    )

    @Test fun offShowsNothing() {
        val c = FlightDirector.compute(base(fdMode = 1))
        assertFalse(c.show)
        assertFalse(c.flag)
    }

    @Test fun unavailableFlightDirectorRaisesTheFlag() {
        val c = FlightDirector.compute(base().copy(fdUp = false))
        assertTrue(c.flag)
        assertFalse(c.show)
    }

    @Test fun radioModeWithoutBeamRaisesTheFlag() {
        val c = FlightDirector.compute(base(fdMode = 4).copy(locValid = false))
        assertTrue(c.flag)
    }

    @Test fun gaModeWingsLevelWithPresetPitchUp() {
        val c = FlightDirector.compute(base(fdMode = 0).copy(roll = 10.0, pitch = 5.0))
        assertTrue(c.show)
        assertEquals(quantize(-10.0), c.bank, 1e-9) // -roll, inside the bank limit
        assertEquals(quantize(10.0), c.pitch, 1e-9) // 15 - 5 = 10, inside the pitch limit
    }

    @Test fun headingModeBanksTowardTheSelectedHeading() {
        // heading error 10 deg * 1.5 = 15 deg bank command, then bank = 15 - roll (0)
        val c = FlightDirector.compute(base(fdMode = 2).copy(selHdg = 100.0, hdg = 90.0))
        assertEquals(quantize(15.0), c.bank, 1e-9) // inside the bank limit
        assertTrue(c.show)
    }

    @Test fun quantizeRoundsHalfUpLikeTheWeb() {
        assertEquals(0.5, FlightDirector.quantizeHalf(0.3), 1e-9)   // 0.3 -> 0.5
        assertEquals(0.5, FlightDirector.quantizeHalf(0.25), 1e-9)  // JS Math.round(0.5) = 1
        assertEquals(-0.0, FlightDirector.quantizeHalf(-0.2), 1e-9) // floor(-0.4 + 0.5) / 2 = 0
    }

    private fun quantize(x: Double) = FlightDirector.quantizeHalf(x)
}
