package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FuelAndGroundRulesTest {
    private val rules = FuelAndGroundRules

    @Test fun boostPumpsFlipOnlyTheirSwitch() {
        val s = initialSimState()
        for (p in rules.BOOST_PUMPS) {
            val t = rules.toggleBoostPump(s, p)
            assertEquals(1, rules.BOOST_PUMPS.count { k -> pumpOn(t, k) })
            assertTrue(pumpOn(t, p))
        }
    }

    private fun pumpOn(s: SimState, k: String): Boolean = when (k) {
        "fuelPump1Fwd" -> s.fuelPump1Fwd
        "fuelPump1Aft" -> s.fuelPump1Aft
        "fuelPumpCenter1" -> s.fuelPumpCenter1
        "fuelPumpCenter2" -> s.fuelPumpCenter2
        "fuelPump2Fwd" -> s.fuelPump2Fwd
        else -> s.fuelPump2Aft
    }

    @Test fun unknownPumpIsRefused() {
        var refused = false
        try { rules.toggleBoostPump(initialSimState(), "fuelPumpX") } catch (e: IllegalArgumentException) { refused = true }
        assertTrue(refused)
    }

    @Test fun crossfeedLabelDependsOnShutoffs() {
        assertEquals("CONTROL OFF", rules.crossfeedLabel(true, false))
        assertEquals("OPEN", rules.crossfeedLabel(true, true))
        assertEquals("CLOSED", rules.crossfeedLabel(false, true))
        assertTrue(rules.toggleCrossfeed(initialSimState()).fuelCrossfeed)
    }

    @Test fun lowFuelAndResetQuantities() {
        val low = rules.setLowFuel(initialSimState())
        assertEquals(25.0, low.fuelTank1, 0.0)
        assertEquals(25.0, low.fuelTankCenter, 0.0)
        assertEquals(25.0, low.fuelTank2, 0.0)
        assertEquals(100.0, rules.resetQuantity(low).fuelTank2, 0.0)
    }

    @Test fun engineButtonRules() {
        assertTrue(rules.startEnabled(running = false, auto = false, fire = false))
        assertFalse(rules.startEnabled(running = false, auto = true, fire = false))
        assertTrue(rules.shutdownEnabled(running = false, auto = false, n2 = 1.0))
        assertFalse(rules.shutdownEnabled(running = false, auto = false, n2 = 0.5))
        assertEquals("ABORT START", rules.shutdownLabel(running = false, auto = true))
        assertEquals("SHUTDOWN", rules.shutdownLabel(running = true, auto = true))
    }

    @Test fun groundAirCartSuppliesPressureOnlyWhenConnected() {
        val s = initialSimState()
        val c = rules.toggleGroundAirCart(s)
        assertTrue(c.groundPneumaticConnected)
        assertEquals(45.0, c.groundPneumaticPsi, 0.0)
        assertEquals(0.0, rules.toggleGroundAirCart(c).groundPneumaticPsi, 0.0)
    }

    @Test fun groundPowerCartSetsGrdPwrWithIt() {
        val c = rules.toggleGroundPowerCart(initialSimState())
        assertTrue(c.externalPowerConnected)
        assertTrue(c.groundPowerOn)
        assertFalse(rules.toggleGroundPowerCart(c).groundPowerOn)
    }

    @Test fun apuAndBleedStartAndStopTogether() {
        val s = initialSimState()
        s.apuMaster = "OFF"
        val start = rules.toggleApuAndBleed(s)
        assertEquals("ON", start.apuMaster)
        assertTrue(start.apuBleed)
        val stop = rules.toggleApuAndBleed(start)
        assertEquals("OFF", stop.apuMaster)
        assertFalse(stop.apuBleed)
        assertEquals("STARTING", rules.apuAndBleedLabel(masterOff = false, available = false))
    }
}
