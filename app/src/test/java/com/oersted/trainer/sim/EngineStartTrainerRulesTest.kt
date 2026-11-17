package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EngineStartTrainerRulesTest {
    private val R = EngineStartTrainerRules

    @Test
    fun statusText() {
        assertEquals("RUNNING", R.status(true, true, true, 90.0))
        assertEquals("FIRE HANDLE PULLED", R.status(false, true, true, 10.0))
        assertEquals("MOTORING ON STARTER", R.status(false, false, true, 19.9))
        assertEquals("LIGHT-OFF / ACCELERATING", R.status(false, false, true, 20.0))
        assertEquals("SPOOLING DOWN", R.status(false, false, false, 1.5))
        assertEquals("SHUT DOWN", R.status(false, false, false, 1.0))
        assertEquals("Engine 2 · SHUT DOWN", R.subTitle(2, "SHUT DOWN"))
    }

    @Test
    fun buttonsAndTapes() {
        assertTrue(R.shutdownDisabled(false, false, 0.5))
        assertFalse(R.shutdownDisabled(false, false, 1.0))
        assertFalse(R.shutdownDisabled(true, false, 0.0))
        assertFalse(R.shutdownDisabled(false, true, 0.0))
        assertTrue(R.fuelOn(true, 18.1, false))
        assertFalse(R.fuelOn(true, 18.0, false))
        assertFalse(R.fuelOn(true, 50.0, true))
        assertFalse(R.fuelOn(false, 50.0, false))
        assertEquals(50.0, R.tapePercent(300.0, 600.0), 0.0)
        assertEquals(100.0, R.tapePercent(900.0, 600.0), 0.0)
        assertEquals(0.0, R.tapePercent(-5.0, 100.0), 0.0)
        assertEquals(12L, R.tapeValue(11.5))
    }

    @Test
    fun chipsAndLabels() {
        assertEquals("FF 1200 PPH · OIL 45 PSI · STARTER AIR 31 PSI (≥ 30 REQUIRED)", R.readoutLine(1199.6, 44.5, 30.6))
        assertEquals("DC AVAILABLE", R.dcChip(true))
        assertEquals("DC OFF", R.dcChip(false))
        assertEquals("L DUCT 30 PSI", R.ductChip("L", 29.5))
        assertTrue(R.ductOk(30.0))
        assertFalse(R.ductOk(29.9))
        assertEquals("BATTERY · ON", R.batteryLabel(true))
        assertEquals("GROUND AIR CART · DISCONNECTED", R.groundAirLabel(false))
        assertEquals("GROUND POWER · CONNECTED", R.groundPowerLabel(true))
        assertEquals("APU + BLEED · OFF", R.apuLabel(true, false))
        assertEquals("APU + BLEED · STARTING", R.apuLabel(false, false))
        assertEquals("APU + BLEED · AVAILABLE", R.apuLabel(false, true))
        assertEquals("ENGINE CUTAWAY · SHOWN", R.cutawayLabel(true))
        assertEquals("ENGINE CUTAWAY · HIDDEN", R.cutawayLabel(false))
    }
}
