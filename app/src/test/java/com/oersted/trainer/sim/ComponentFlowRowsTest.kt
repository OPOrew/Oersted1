package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Test

class ComponentFlowRowsTest {
    @Test fun coldAndDarkIsAllOff() {
        val rows = TrainingConsoleRules.componentFlowRows(initialSimState().apply { hydAPress = 0.0; hydBPress = 0.0 }, Derived())
        assertEquals(listOf("HYD A → OFF", "HYD B → OFF", "PNEU L → OFF", "PNEU R → OFF", "AUTOBRAKE → OFF"), rows)
    }

    @Test fun pressureThresholdIsStrictlyAbove1500() {
        val s = initialSimState().apply { hydAPress = 1500.0; hydBPress = 1500.1 }
        val rows = TrainingConsoleRules.componentFlowRows(s, Derived())
        assertEquals("HYD A → OFF", rows[0])
        assertEquals("HYD B → PRESSURIZED", rows[1])
    }

    @Test fun autobrakeActiveBeatsArmed() {
        val d = Derived().apply { autobrakeArmed = true; autobrakeActive = true; leftManifold = true }
        val rows = TrainingConsoleRules.componentFlowRows(initialSimState(), d)
        assertEquals("AUTOBRAKE → ACTIVE", rows[4])
        assertEquals("PNEU L → SUPPLIED", rows[2])
        d.autobrakeActive = false
        assertEquals("AUTOBRAKE → ARMED", TrainingConsoleRules.componentFlowRows(initialSimState(), d)[4])
    }
}
