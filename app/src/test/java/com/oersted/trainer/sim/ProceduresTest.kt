package com.oersted.trainer.sim

import com.oersted.trainer.sim.Procedures.PROCEDURES
import com.oersted.trainer.sim.Procedures.ProcedureCategory
import com.oersted.trainer.sim.Procedures.isDone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProceduresTest {
    private fun step(procId: String, stepId: String) =
        PROCEDURES.first { it.id == procId }.steps.first { it.id == stepId }

    @Test fun catalogueHasTenProceduresAndFortySteps() {
        assertEquals(10, PROCEDURES.size)
        assertEquals(40, PROCEDURES.sumOf { it.steps.size })
        assertEquals(5, PROCEDURES.count { it.category == ProcedureCategory.EMERGENCY })
    }

    @Test fun procedureIdsAreUnique() {
        assertEquals(PROCEDURES.size, PROCEDURES.map { it.id }.toSet().size)
    }

    @Test fun coldAndDarkBatteryStepIsNotDone() {
        assertFalse(isDone(step("apu-start", "bat"), initialSimState()))
    }

    @Test fun batteryStepDoneWhenBatteryOn() {
        val s = initialSimState().apply { battery = true }
        assertTrue(isDone(step("apu-start", "bat"), s))
    }

    @Test fun apuDoorThresholdIsStrict() {
        val open = initialSimState().apply { apuDoor = 0.98 }
        val part = initialSimState().apply { apuDoor = 0.9 }
        assertTrue(isDone(step("apu-start", "door"), open))
        assertFalse(isDone(step("apu-start", "door"), part))
    }

    @Test fun pullStepNeedsTheFaultAndTheHandle() {
        val faultOnly = initialSimState().apply { faults.engineFire1 = true }
        assertFalse(isDone(step("emergency-engine-fire", "pull"), faultOnly))
        val both = initialSimState().apply { faults.engineFire1 = true; engine1FirePulled = true }
        assertTrue(isDone(step("emergency-engine-fire", "pull"), both))
    }

    @Test fun rudderStepUsesAbsolutePedalDeflection() {
        val left = initialSimState().apply { rudderPedal = -0.5 }
        assertTrue(isDone(step("emergency-hydraulic-a-loss", "control"), left))
        val centred = initialSimState().apply { rudderPedal = 0.05 }
        assertFalse(isDone(step("emergency-hydraulic-a-loss", "control"), centred))
    }
}
