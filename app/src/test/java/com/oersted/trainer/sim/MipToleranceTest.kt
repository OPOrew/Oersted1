package com.oersted.trainer.sim

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The MainInstrumentPanel write tolerances (nav solution, FD command), so the MIP store is not rewritten every 100 ms tick. */
class MipToleranceTest {
    private val base = RadioNav.RadioNavData(true, true, false, 90.0, 0.10, 0.00, 20.0, 18.0)

    @Test fun smallMovesAreIgnored() {
        assertFalse(RadioNav.navWriteNeeded(base, base.copy(radial = 90.19, locDev = 0.119, gsErr = 0.019, thrDist = 18.049)))
    }

    @Test fun movesPastToleranceWrite() {
        assertTrue(RadioNav.navWriteNeeded(base, base.copy(radial = 90.21)))
        assertTrue(RadioNav.navWriteNeeded(base, base.copy(locDev = 0.13)))
        assertTrue(RadioNav.navWriteNeeded(base, base.copy(gsErr = 0.03)))
        assertTrue(RadioNav.navWriteNeeded(base, base.copy(thrDist = 18.06)))
    }

    @Test fun vorDistanceAloneDoesNotTriggerAWrite() {
        // the web compares thrDist, not vorDist
        assertFalse(RadioNav.navWriteNeeded(base, base.copy(vorDist = 25.0)))
    }

    @Test fun flagFlipsAlwaysWrite() {
        assertTrue(RadioNav.navWriteNeeded(base, base.copy(vorValid = false)))
        assertTrue(RadioNav.navWriteNeeded(base, base.copy(locValid = false)))
        assertTrue(RadioNav.navWriteNeeded(base, base.copy(gsValid = true)))
    }

    @Test fun fdCommand() {
        val c = FlightDirector.Command(show = true, flag = false, bank = 5.0, pitch = -2.0)
        assertFalse(FlightDirector.cmdWriteNeeded(true, false, 5.0, -2.0, c))
        assertTrue(FlightDirector.cmdWriteNeeded(true, false, 4.5, -2.0, c))
        assertTrue(FlightDirector.cmdWriteNeeded(true, false, 5.0, -1.5, c))
        assertTrue(FlightDirector.cmdWriteNeeded(false, false, 5.0, -2.0, c))
        assertTrue(FlightDirector.cmdWriteNeeded(true, true, 5.0, -2.0, c))
    }
}
