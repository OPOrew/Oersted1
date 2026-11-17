package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TrainerGearRulesTest {
    private val R = TrainerGearRules

    @Test
    fun clampsAndPower() {
        assertEquals(0.0, R.clamp01(-0.5), 0.0)
        assertEquals(1.0, R.clamp01(3.0), 0.0)
        assertEquals(0.4, R.clamp01(0.4), 0.0)
        assertEquals(-78.0, R.steering(-120.0), 0.0)
        assertEquals(78.0, R.steering(90.0), 0.0)
        assertEquals(12.0, R.steering(12.0), 0.0)
        assertTrue(R.hydraulicAvailable(1501.0))
        assertFalse(R.hydraulicAvailable(1500.0))
        assertEquals("HYD A AVAILABLE", R.hydLabel(true))
        assertEquals("HYD A LOW / OFF", R.hydLabel(false))
    }

    @Test
    fun gearStateText() {
        assertEquals("EXTENDING", R.gearState(true, "DN", false, false))
        assertEquals("RETRACTING", R.gearState(true, "UP", false, false))
        assertEquals("TRANSIT / HOLD", R.gearState(true, "OFF", false, false))
        assertEquals("DOWN / LOCKED", R.gearState(false, "DN", true, false))
        assertEquals("UP / LOCKED", R.gearState(false, "UP", false, true))
        assertEquals("TRANSIT", R.gearState(false, "OFF", false, false))
        assertEquals("DOWNLOCK", R.lockState(true, false))
        assertEquals("UPLOCK", R.lockState(false, true))
        assertEquals("MOVING", R.lockState(false, false))
    }

    @Test
    fun mechanism() {
        assertFalse(R.moving(0.02))
        assertTrue(R.moving(0.5))
        assertFalse(R.moving(0.98))
        assertEquals("EXTENDING", R.mechanismLabel(true, false, 0.5))
        assertEquals("RETRACTING", R.mechanismLabel(false, true, 0.5))
        assertEquals("DOWN / LOCKED", R.mechanismLabel(false, false, 1.0))
        assertEquals("UP / LOCKED", R.mechanismLabel(false, false, 0.0))
        assertEquals("TRANSIT / HOLD", R.mechanismLabel(false, false, 0.5))
        assertEquals(0, R.lockLamp(0.98))
        assertEquals(1, R.lockLamp(0.02))
        assertEquals(2, R.lockLamp(0.5))
        assertEquals(2, R.labelTone(true, false, 1.0))
        assertEquals(0, R.labelTone(false, false, 1.0))
        assertEquals(1, R.labelTone(false, false, 0.0))
        assertEquals(2, R.labelTone(false, false, 0.5))
        assertEquals(0.0, R.mainAngle(0, 1.0), 0.0)
        assertEquals(-90.0, R.mainAngle(0, 0.0), 0.0)
        assertEquals(90.0, R.mainAngle(1, 0.0), 0.0)
        assertEquals(45.0, R.mainAngle(1, 0.5), 0.0)
        val (x, y) = R.arcPoint(145.0, 93.0, 168.0, 0.0)
        assertEquals(145.0, x, 1.0e-9)
        assertEquals(261.0, y, 1.0e-9)
        val (x2, y2) = R.arcPoint(145.0, 93.0, 168.0, 90.0)
        assertEquals(-23.0, x2, 1.0e-9)
        assertEquals(93.0, y2, 1.0e-9)
        assertTrue(R.arcSweep(0.0, 30.0))
        assertFalse(R.arcSweep(0.0, -30.0))
        assertTrue(R.arcSweep(0.0, 0.0))
    }

    @Test
    fun manualExtension() {
        assertFalse(R.manualAllowed("UP"))
        assertTrue(R.manualAllowed("OFF"))
        assertTrue(R.manualAllowed("DN"))
        assertEquals("NOSE GEAR", R.manualGearLabel("nose"))
        assertEquals("LEFT MAIN GEAR", R.manualGearLabel("leftMain"))
        assertEquals("RIGHT MAIN GEAR", R.manualGearLabel("rightMain"))
        assertEquals("MANUAL EXTENSION — NOSE GEAR uplock released; T-handle returned.", R.manualNote("nose"))
        assertEquals("LEVER OFF", R.manualStatus(false, true))
        assertEquals("UPLOCK RELEASED", R.manualStatus(true, true))
        assertEquals("PULL / RELEASE", R.manualStatus(true, false))
        assertEquals(listOf("leftMain", "nose", "rightMain"), R.MANUAL_HANDLES.map { it.second })
    }

    @Test
    fun readouts() {
        assertEquals("100% DOWN/LOCKED", R.legReadout(1.0, true, false))
        assertEquals("50% RED/UNSAFE", R.legReadout(0.5, false, true))
        assertEquals("0% UP", R.legReadout(0.0, false, false))
        assertEquals("13% RED/UNSAFE", R.legReadout(0.125, false, true))
        assertEquals("ENABLED", R.overrideText(true))
        assertEquals("NORMAL / GROUND LOCK", R.overrideText(false))
        assertEquals("HORN ACTIVE", R.hornText(true))
        assertEquals("SILENT", R.hornText(false))
        assertEquals("SYSTEM A", R.steeringSource(true))
        assertEquals("OFF", R.steeringSource(false))
        assertEquals("12", R.toFixed0(12.4))
        assertEquals("13", R.toFixed0(12.5))
        assertEquals("-13", R.toFixed0(-12.5))
        assertEquals("-0", R.toFixed0(-0.4))
        assertEquals("0", R.toFixed0(0.0))
        assertEquals("ANGLE 7°", R.angleChip(7.2))
        assertEquals("SOURCE SYSTEM A", R.sourceChip(true))
    }
}
