package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ElectricalTrainerRulesTest {
    private val rules = ElectricalTrainerRules

    @Test fun groundCartDropsGroundPower() {
        val s = initialSimState()
        s.groundPowerOn = true
        val c = rules.toggleGroundCart(s)
        assertTrue(c.externalPowerConnected)
        assertFalse(c.groundPowerOn)
    }

    @Test fun genButtonsNeedTheEngineRunning() {
        val s = initialSimState()
        val d = Derived()
        assertTrue(rules.toggleGen(s, d, 1) === s)
        d.eng1Running = true
        assertTrue(rules.toggleGen(s, d, 1).gen1)
        assertFalse(rules.toggleGen(s, d, 2).gen2) // engine 2 not running: unchanged
    }

    @Test fun groundPowerOnOverridesGroundService() {
        val s = initialSimState()
        s.groundServiceOn = true
        val o = rules.toggleGroundPower(s)
        assertTrue(o.state.groundPowerOn)
        assertFalse(o.state.groundServiceOn)
        assertEquals("GROUND POWER ON \u2014 ground service switch overridden by normal external-power distribution.", o.message)
        assertEquals("GROUND POWER OFF", rules.toggleGroundPower(o.state).message)
    }

    @Test fun groundServiceNeedsGroundOrAcPower() {
        val s = initialSimState()
        val d = Derived()
        assertTrue(rules.toggleGroundService(s, d) === s)
        d.acPower = true
        assertTrue(rules.toggleGroundService(s, d).groundServiceOn)
    }

    @Test fun standbySelectorSetsItsMode() {
        assertEquals("BAT", rules.setStandbyPower(initialSimState(), "BAT").standbyPower)
    }

    @Test fun apuMasterStartAppliesBatteryUnlessExternalDcSupplies() {
        val s = initialSimState()
        s.battery = false
        val d = Derived()
        val byBattery = rules.toggleApuMaster(s, d)
        assertEquals("START", byBattery.state.apuMaster)
        assertTrue(byBattery.state.battery)
        assertEquals("APU START command \u2014 battery power applied for the electric APU starter.", byBattery.message)
        d.externalDcControl = true
        val byExternal = rules.toggleApuMaster(s, d)
        assertFalse(byExternal.state.battery)
        assertEquals("APU START command \u2014 external electrical power supplying the starter circuit.", byExternal.message)
    }

    @Test fun apuMasterOffDropsGeneratorControls() {
        val s = initialSimState()
        s.apuMaster = "ON"
        s.apuGen = true
        s.apuLeftControl = true
        val o = rules.toggleApuMaster(s, Derived())
        assertEquals("OFF", o.state.apuMaster)
        assertFalse(o.state.apuGen)
        assertFalse(o.state.apuLeftControl)
        assertEquals(null, o.message)
    }
}
