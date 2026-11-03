package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Hand-written checks for SimActions (store.ts actions). */
class SimActionsTest {
    private fun powered(): SimState {
        val s = initialSimState()
        s.battery = true
        return s
    }

    @Test fun startInhibitedWithoutDcPower() {
        val s = initialSimState()
        s.battery = false
        val r = SimActions.startEngine(s, 1, 0.0)
        assertTrue(r.log[0].text.contains("no DC power"))
        assertEquals("OFF", r.start1)
    }

    @Test fun startInhibitedByFirePull() {
        val s = powered()
        s.engine1FirePulled = true
        val r = SimActions.startEngine(s, 1, 0.0)
        assertEquals("Engine 1 start inhibited — fire handle pulled.", r.log[0].text)
        assertEquals("warn", r.log[0].tone)
    }

    @Test fun startSelectsGrdAndArmsAutoStart() {
        val s = powered()
        val r = SimActions.startEngine(s, 2, 0.0)
        assertEquals("GRD", r.start2)
        assertEquals(false, r.lever2)
        assertTrue(r.autoStart2)
        // The initial state has no starter air, so the web takes the below-30-psi branch.
        assertTrue(r.log[0].text.contains("below 30 psi"))
    }

    @Test fun shutdownSetsOffAndCutoff() {
        val s = powered()
        s.start1 = "GRD"; s.lever1 = true; s.autoStart1 = true
        val r = SimActions.shutdownEngine(s, 1, 0.0)
        assertEquals("OFF", r.start1)
        assertEquals(false, r.lever1)
        assertEquals(false, r.autoStart1)
        assertEquals("ENG 1 shutdown — START LEVER to CUTOFF.", r.log[0].text)
    }

    @Test fun gearFaultPicksFirstChoiceWhenRandomIsZero() {
        val s = powered()
        val r = SimActions.injectLandingGearFault(s, 0.0) { 0.0 }
        assertEquals("NOSE", r.landingGearFault)
        assertEquals(0.0, r.noseGearPos, 0.0)
        assertEquals("DN", r.gear)
        assertTrue(r.log[0].text.contains("NOSE GEAR failed to extend"))
    }

    @Test fun gearFaultPicksADifferentGearWhenOneExists() {
        val s = powered()
        s.landingGearFault = "NOSE"
        val r = SimActions.injectLandingGearFault(s, 0.0) { 0.0 }
        assertEquals("LEFT_MAIN", r.landingGearFault)
    }

    @Test fun clearGearFaultIsNoOpWithoutFault() {
        val s = powered()
        assertTrue(SimActions.clearLandingGearFault(s, 0.0) === s)
        s.landingGearFault = "RIGHT_MAIN"
        val r = SimActions.clearLandingGearFault(s, 0.0)
        assertEquals("NONE", r.landingGearFault)
        assertEquals("Fault cleared: LANDING GEAR POSITION fault.", r.log[0].text)
    }

    @Test fun toggleFaultOnThenOff() {
        val s = powered()
        val on = SimActions.toggleFault(s, "hydALeak", 0.0)
        assertTrue(on.faults.hydALeak)
        assertEquals("Fault on: Hydraulic System A leak", on.log[0].text)
        val off = SimActions.toggleFault(on, "hydALeak", 0.0)
        assertTrue(!off.faults.hydALeak)
        assertEquals("Fault cleared: Hydraulic System A leak", off.log[0].text)
    }

    @Test fun faultTableCoversEveryKey() {
        assertEquals(93, FaultTable.LABELS.size)
        assertEquals("Engine 1 fire detected", FaultTable.LABELS["engineFire1"])
    }

    @Test fun readyApuPresetReplacesLog() {
        val r = SimActions.readyApu(5.0)
        assertEquals("ON", r.apuMaster)
        assertEquals(100.0, r.apuRpm, 0.0)
        assertTrue(r.apuGen)
        assertTrue(r.packL && r.packR)
        assertEquals(1, r.log.size)
        assertEquals("Preset: APU running at 100%, generator on bus, bleed open.", r.log[0].text)
        assertEquals(5.0, r.log[0].t, 0.0)
    }

    @Test fun readyForDeparturePresetKeepsFuelAndFaults() {
        val s = initialSimState()
        s.battery = false
        s.fuelTank1 = 42.0
        s.faults.hydALeak = true
        s.n2_1 = 10.0
        val before = s.log.size
        val r = SimActions.readyForDeparture(s, 9.0)
        assertTrue(r.battery)
        assertEquals(62.0, r.n2_1, 0.0)
        assertEquals(42.0, r.fuelTank1, 0.0)
        assertTrue(r.faults.hydALeak)
        assertEquals(0.05, r.throttle1, 0.0)
        // The web appends this entry at the end of the log (unlike pushLog, which prepends); kept as-is.
        assertTrue(r.log.last().text.startsWith("Ready for departure"))
        assertEquals(before + 1, r.log.size)
    }

    @Test fun trThreeBackupScenario() {
        val r = SimActions.runScenario(initialSimState(), "TR3_BACKUP", 0.0)
        assertTrue(r.faults.tr1Failure)
        assertTrue(!r.faults.tr2Failure)
        assertTrue(!r.battery)
        assertTrue(r.log[0].text.contains("TR 3 is fed from GEN BUS 2"))
    }

    @Test fun adverseYawScenarioIsAirborne() {
        val r = SimActions.runScenario(initialSimState(), "ADVERSE_YAW", 0.0)
        assertTrue(!r.wow)
        assertEquals(140.0, r.groundSpeedKt, 0.0)
        assertEquals(0.55, r.yokeRoll, 0.0)
        assertTrue(r.adverseYawScenario)
    }

    @Test fun rtoScenarioArmsAutobrake() {
        val r = SimActions.runScenario(initialSimState(), "AUTOBRAKE_RTO", 0.0)
        assertEquals(4.0, r.autobrake, 0.0)
        assertTrue(r.autobrakeRtoArmed)
        assertTrue(r.log[0].text.startsWith("Scenario: RTO"))
    }

    @Test fun unknownNameFallsBackToTeFlapScenario() {
        val r = SimActions.runScenario(initialSimState(), "ALT_FLAP_ALTERNATE", 0.0)
        assertEquals(15.0, r.flaps, 0.0)
        assertTrue(r.faults.teFlapHydMotorFail)
    }
}
