package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Values below were read from initialSim in src/lib/sim/initial.ts. */
class SimTypesTest {
    @Test fun initialValuesMatchWebSource() {
        val s = initialSimState()
        assertFalse(s.battery)
        assertEquals(4.0, s.timeScale, 0.0)
        assertEquals("OFF", s.apuMaster)
        assertEquals("NONE", s.cargoArmed)
        assertEquals(100.0, s.fuelTank1, 0.0)
        assertEquals("OFF", s.start1)
        assertEquals(1, s.log.size)
        assertEquals(39, s.circuitBreakers.size)
        assertTrue(s.faults.let { f -> listOf(f.apuDoorJam, f.engineFire1, f.flapAsymmetry).none { it } })
    }

    @Test fun copyIsDeepForNestedObjectsAndShallowForLists() {
        val s = initialSimState()
        val c = s.copy()
        c.faults.apuDoorJam = true
        assertFalse(s.faults.apuDoorJam)
        c.log.add(LogEntry())
        assertEquals(1, s.log.size)
    }
}
