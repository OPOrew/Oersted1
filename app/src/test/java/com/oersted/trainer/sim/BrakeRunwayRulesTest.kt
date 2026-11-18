package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BrakeRunwayRulesTest {
    private fun rolling(): SimState = initialSimState().apply {
        wow = true; rwyPhase = "ROLLOUT"; groundSpeedKt = 100.0
    }

    @Test fun approachMovesTowardTargetWithoutOvershoot() {
        assertEquals(0.5, BrakeRunwayRules.approachF(0.0, 1.0, 0.5), 1e-9)
        assertEquals(1.0, BrakeRunwayRules.approachF(0.8, 1.0, 0.5), 1e-9)
        assertEquals(0.3, BrakeRunwayRules.approachF(1.0, 0.0, 0.7), 1e-9)
    }

    @Test fun slipIsZeroBelowEightKnotsOrAirborne() {
        val s = rolling().apply { groundSpeedKt = 5.0 }
        assertEquals(0.0, BrakeRunwayRules.slip(s, "li"), 1e-9)
        val a = rolling().apply { wow = false }
        assertEquals(0.0, BrakeRunwayRules.slip(a, "li"), 1e-9)
    }

    @Test fun slipIsOneMinusWheelOverGroundSpeed() {
        val s = rolling().apply { wheelSpeeds.li = 75.0 }
        assertEquals(0.25, BrakeRunwayRules.slip(s, "li"), 1e-9)
    }

    @Test fun statusClassifiesSkidThenSpinupThenModulationThenBraking() {
        val d = Derived().apply { antiskidOperational = true }
        val s = rolling().apply { wheelBrakePressures.li = 2000.0; wheelSpeeds.li = 10.0 }
        assertEquals("SKID", BrakeRunwayRules.status(s, d, "li").text)
        assertEquals(3, BrakeRunwayRules.status(s, d, "li").hot)
        s.wheelBrakePressures.li = 50.0
        assertEquals("SPIN-UP", BrakeRunwayRules.status(s, d, "li").text)
        s.wheelSpeeds.li = 80.0; s.wheelBrakePressures.li = 500.0   // slip 0.2
        assertEquals("A/S MOD", BrakeRunwayRules.status(s, d, "li").text)
        d.antiskidOperational = false
        assertEquals("BRAKING", BrakeRunwayRules.status(s, d, "li").text)
        s.wheelBrakePressures.li = 0.0
        assertEquals("ROLLING", BrakeRunwayRules.status(s, d, "li").text)
    }

    @Test fun statusIsDashWhenIdleOrAirborne() {
        val d = Derived()
        assertEquals("—", BrakeRunwayRules.status(initialSimState(), d, "ro").text)
    }

    @Test fun veeringNeedsRolloutSpeedAndOffset() {
        val s = rolling().apply { rwyHdgDeg = 3.0 }
        assertTrue(BrakeRunwayRules.veering(s))
        s.rwyHdgDeg = 1.0; s.rwyLatM = 2.0
        assertFalse(BrakeRunwayRules.veering(s))
        s.rwyLatM = 5.0
        assertTrue(BrakeRunwayRules.veering(s))
        assertEquals("LEFT", BrakeRunwayRules.fix(rolling().apply { rwyHdgDeg = 4.0 }))
        assertEquals("RIGHT", BrakeRunwayRules.fix(rolling().apply { rwyHdgDeg = -4.0 }))
    }

    @Test fun pedalTickRampsAndReleasesOwnership() {
        val up = BrakeRunwayRules.pedalTick(BrakeRunwayRules.Hold(pushR = true), BrakeRunwayRules.Own(), 0.0, 0.0, 0.0, 0.1)
        assertEquals(0.24, up.rudder, 1e-9)
        assertTrue(up.own.rud)
        val back = BrakeRunwayRules.pedalTick(BrakeRunwayRules.Hold(), up.own, 0.5, 0.0, 0.0, 0.1)
        assertEquals(0.0, back.rudder, 1e-9)   // 0.5 - 0.8 clamps to 0
        assertFalse(back.own.rud)
        val toe = BrakeRunwayRules.pedalTick(BrakeRunwayRules.Hold(toeL = true), BrakeRunwayRules.Own(), 0.0, 0.0, 0.0, 0.1)
        assertEquals(0.22, toe.left, 1e-9)
    }

    @Test fun startPutsAircraftOnFinalWithRequestedScenario() {
        val s = BrakeRunwayRules.start(initialSimState(), runway = "WET", patch = "LEFT", autobrake = 3, asOn = true)
        assertEquals("APPROACH", s.rwyPhase)
        assertEquals("WET", s.runway)
        assertEquals("LEFT", s.rwyPatch)
        assertEquals(3.0, s.autobrake, 0.0)
        assertEquals("ARMED", s.speedBrake)
        assertEquals(138.0, s.groundSpeedKt, 0.0)
        assertFalse(s.wow)
        assertEquals(1.0, s.timeScale, 0.0)
    }

    @Test fun resetReturnsToIdleOnTheGround() {
        val s = BrakeRunwayRules.reset(BrakeRunwayRules.start(initialSimState()))
        assertEquals("IDLE", s.rwyPhase)
        assertTrue(s.wow)
        assertEquals(0.0, s.groundSpeedKt, 0.0)
    }

    @Test fun hintsCoverAutobrakeAndNoBrakingCases() {
        val d = Derived()
        val a = initialSimState().apply { rwyPhase = "APPROACH"; autobrake = 2.0; antiskidInbd = false }
        assertTrue(BrakeRunwayRules.hints(a, d).any { it.startsWith("AUTOBRAKE unavailable") })
        val r = rolling().apply { autobrake = 0.0 }
        assertTrue(BrakeRunwayRules.hints(r, d).any { it.startsWith("No braking applied") })
    }

    @Test fun readoutTextFollowsWebRounding() {
        val s = rolling().apply { rwyPosM = 1500.4; rwyLatM = -7.6; rwyHdgDeg = 2.6 }
        assertEquals("300 m", BrakeRunwayRules.rwyLeft(s))
        assertEquals("8 m L", BrakeRunwayRules.offsetText(s))
        assertEquals("3° R", BrakeRunwayRules.hdgText(s))
        assertEquals("—", BrakeRunwayRules.rwyLeft(initialSimState()))
    }
}
