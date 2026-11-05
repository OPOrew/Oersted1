package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FireProtectionRulesTest {
    private val rules = FireProtectionRules

    @Test fun engineHandleNeedsAFireOrAPulledHandle() {
        assertTrue(rules.pullEngineHandle(initialSimState(), 1, detected = false) == null)
        val pulled = rules.pullEngineHandle(initialSimState(), 1, detected = true)!!
        assertTrue(pulled.state.engine1FirePulled)
        assertEquals("ENG 1 FIRE handle pulled \u2014 fuel, bleed, generator and engine hydraulic supply isolated.", pulled.message)
        val reset = rules.pullEngineHandle(pulled.state, 1, detected = false)!!
        assertFalse(reset.state.engine1FirePulled)
        assertEquals("ENG 1 fire handle reset.", reset.message)
    }

    @Test fun engineBottleNeedsThePulledHandleAndIsUsedOnce() {
        val s = initialSimState()
        assertTrue(rules.dischargeEngineBottle(s, 2, left = true, stubborn = false) == null)
        s.engine2FirePulled = true
        s.faults.engineFire2 = true
        val d = rules.dischargeEngineBottle(s, 2, left = true, stubborn = false)!!
        assertTrue(d.state.fireBottleLDischarged)
        assertFalse(d.state.faults.engineFire2) // fire cleared
        assertTrue(rules.dischargeEngineBottle(d.state, 2, left = true, stubborn = false) == null)
    }

    @Test fun stubbornFirstBottleLeavesTheFire() {
        val s = initialSimState()
        s.engine1FirePulled = true
        s.faults.engineFire1 = true
        val first = rules.dischargeEngineBottle(s, 1, left = false, stubborn = true)!!
        assertTrue(first.state.faults.engineFire1)
        assertEquals("ENG 1 bottle R discharged \u2014 FIRE PERSISTS. Discharge the other bottle.", first.message)
        val second = rules.dischargeEngineBottle(first.state, 1, left = true, stubborn = true)!!
        assertFalse(second.state.faults.engineFire1)
    }

    @Test fun apuHandleAndBottle() {
        val s = initialSimState()
        assertTrue(rules.pullApuHandle(s) == null)
        s.faults.apuFireDetected = true
        val pulled = rules.pullApuHandle(s)!!
        assertTrue(pulled.state.apuFirePulled)
        assertTrue(rules.dischargeApuBottle(s) == null) // not pulled yet
        val d = rules.dischargeApuBottle(pulled.state)!!
        assertTrue(d.state.apuBottleFired)
        assertFalse(d.state.faults.apuFireDetected)
        assertEquals("APU bottle discharged, fire out.", d.message)
    }

    @Test fun cargoArmSelectsAndClears() {
        val s = initialSimState()
        s.cargoFireInstalled = true
        assertEquals("FWD", rules.armCargo(s, "FWD")!!.state.cargoArmed)
        assertEquals("NONE", rules.armCargo(rules.armCargo(s, "FWD")!!.state, "FWD")!!.state.cargoArmed)
        s.cargoFireInstalled = false
        assertTrue(rules.armCargo(s, "AFT") == null)
    }

    @Test fun cargoDischargeNeedsAnArmedCompartment() {
        val s = initialSimState()
        s.cargoFireInstalled = true
        assertTrue(rules.dischargeCargo(s) == null)
        s.cargoArmed = "AFT"
        val d = rules.dischargeCargo(s)!!
        assertTrue(d.state.cargoBottleDischarged)
        assertEquals("CARGO FIRE DISCH \u2014 agent released into the AFT compartment.", d.message)
        assertTrue(rules.dischargeCargo(d.state) == null)
    }

    @Test fun cargoInstalledToggleDisarmsAndRecharges() {
        val s = initialSimState()
        s.cargoFireInstalled = true
        s.cargoArmed = "FWD"
        s.cargoBottleDischarged = true
        val o = rules.toggleCargoInstalled(s)
        assertFalse(o.state.cargoFireInstalled)
        assertEquals("NONE", o.state.cargoArmed)
        assertFalse(o.state.cargoBottleDischarged)
        assertEquals("Cargo fire system REMOVED (pre-SB / not installed).", o.message)
    }

    @Test fun cargoLoopMessageReportsTheNewState() {
        val s = initialSimState()
        s.cargoLoopA = true
        val failed = rules.toggleCargoLoop(s, loopA = true)
        assertFalse(failed.state.cargoLoopA)
        assertEquals("Cargo detector loop A FAILED.", failed.message)
        assertEquals("Cargo detector loop A OK.", rules.toggleCargoLoop(failed.state, loopA = true).message)
    }

    @Test fun injectionsRaiseLevelsToTheirMinimum() {
        val s = initialSimState()
        s.wheelWellLevel = 0.05
        assertEquals(0.15, rules.injectWheelWellFire(s).state.wheelWellLevel, 0.0)
        s.cargoFwdLevel = 0.1
        assertEquals(0.25, rules.injectCargoFire(s, forward = true).state.cargoFwdLevel, 0.0)
        assertTrue(rules.injectCargoFire(s, forward = false).state.cargoAftFire)
    }

    @Test fun gearLeverMessages() {
        val s = initialSimState()
        assertEquals("DN", rules.setGearLever(s, down = true).state.gear)
        assertEquals("UP", rules.setGearLever(s, down = false).state.gear)
    }

    @Test fun injectFaultSetsOnlyThatFault() {
        val s = initialSimState()
        val o = rules.injectFault(s, "engineFire2")
        assertTrue(o.state.faults.engineFire2)
        assertFalse(o.state.faults.engineFire1)
        assertEquals("Fire injected: ENG 2.", o.message)
        assertEquals("Fire injected: APU.", rules.injectFault(s, "apuFireDetected").message)
    }

    @Test fun clearAllResetsEverything() {
        val s = initialSimState()
        s.engine1FirePulled = true
        s.faults.engineFire1 = true
        s.cargoArmed = "FWD"
        val c = rules.clearAll(s).state
        assertFalse(c.engine1FirePulled)
        assertFalse(c.faults.engineFire1)
        assertEquals("NONE", c.cargoArmed)
        assertTrue(s.engine1FirePulled) // original untouched
    }

    @Test fun setupLeavesEnginesAndApuRunningWithGearDown() {
        val o = rules.setupRunning(initialSimState(), nowMs = 0.0)
        assertTrue(o.state.battery)
        assertEquals(35.0, o.state.n1_1, 0.0)
        assertEquals("DN", o.state.gear)
        assertEquals("ON", o.state.apuMaster)
        assertFalse(o.state.engine2FirePulled)
        assertEquals("Fire trainer: engines and APU running, gear down, all bottles charged.", o.message)
    }
}
