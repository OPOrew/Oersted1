package com.oersted.trainer.sim

import com.oersted.trainer.sim.PlanNav.Inputs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlanNavTest {
    private fun base() = Inputs(
        planNav = true, guideActive = true, headingMagCmdDeg = 90.0, targetAltFt = 5000.0, guideNote = "LEG 1",
        ailOn = true, elevOn = true, cwsR = false, cwsP = false, navHeld = false, apHdgSw = 1, apPitch = 1,
        flying = true, ga = false, altBad = false, gsCapAp = false, prevAltSel = false,
    )

    @Test fun planLateralActiveWhenAilEngagedAndHdgSelNotSelected() {
        val r = PlanNav.evaluate(base())
        assertTrue(r.planLat)
        assertEquals("ACTIVE LEG 1", r.status)
    }

    @Test fun hdgSelOverridesPlanHeading() {
        val r = PlanNav.evaluate(base().copy(apHdgSw = 2))
        assertFalse(r.planLat)
        assertEquals("HDG SEL OVERRIDES", r.status)
    }

    @Test fun ilsCaptureTakesOverFromPlanHeading() {
        val r = PlanNav.evaluate(base().copy(navHeld = true))
        assertFalse(r.planLat)
        assertEquals("ILS", r.status)
    }

    @Test fun planVerticalSetsAltitudeTargetWithPitchSwitchOff() {
        val r = PlanNav.evaluate(base())
        assertTrue(r.planVert)
        assertTrue(r.altSel)
        assertEquals(5000.0, r.altApFromPlan!!, 0.0)
        assertFalse(r.altApCaptureHere)
    }

    @Test fun altHoldOnPanelWinsOverPlanVertical() {
        val r = PlanNav.evaluate(base().copy(apPitch = 2))
        assertFalse(r.planVert)
        assertEquals(null, r.altApFromPlan)
        assertTrue(r.altSel)
        assertTrue(r.altApCaptureHere)
    }

    @Test fun altHoldCapturesOnlyOnRisingEdge() {
        assertFalse(PlanNav.evaluate(base().copy(apPitch = 2, prevAltSel = true)).altApCaptureHere)
    }

    @Test fun gsCaptureSuppressesPlanVertical() {
        val r = PlanNav.evaluate(base().copy(gsCapAp = true))
        assertFalse(r.planVert)
        assertFalse(r.altSel)
    }

    @Test fun statusOffWhenSwitchOff() {
        assertEquals("OFF", PlanNav.evaluate(base().copy(planNav = false)).status)
        assertFalse(PlanNav.evaluate(base().copy(planNav = false)).planLat)
    }

    @Test fun statusNoPlanAndArmedAndEngageAil() {
        assertEquals("NO PLAN", PlanNav.evaluate(base().copy(guideActive = false)).status)
        assertEquals("ARMED - ENGAGE AIL", PlanNav.evaluate(base().copy(ailOn = false)).status)
        assertEquals("ARMED", PlanNav.evaluate(base().copy(headingMagCmdDeg = null)).status)
    }
}
