package com.oersted.trainer.sim

import com.oersted.trainer.sim.PitotStatic.atmosphere
import com.oersted.trainer.sim.PitotStatic.altitudeFromStatic
import com.oersted.trainer.sim.PitotStatic.casFromDynamicPressure
import com.oersted.trainer.sim.PitotStatic.computeAirData
import com.oersted.trainer.sim.PitotStatic.flightStateActive
import com.oersted.trainer.sim.PitotStatic.impactPressureFromCas
import com.oersted.trainer.sim.PitotStatic.machFromDynamicPressure
import com.oersted.trainer.sim.PitotStatic.pitotIced
import com.oersted.trainer.sim.PitotStatic.vmoMmoLimitKt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PitotStaticTest {
    /** Trainer-mode state: airborne at 10,000 ft and 250 kt, all sources and CADC channels powered and healthy. */
    private fun healthy(): SimState = initialSimState().apply {
        psTrainerEnabled = true
        psFlightAltFt = 10000.0
        psFlightCasKt = 250.0
        psFlightVsFpm = 0.0
        psBaroCaptHpa = 1013.25
        psBaroFoHpa = 1013.25
        psBaroStbyHpa = 1013.25
        psCadc1Cb = true; psCadc2Cb = true
        psCadc1Ac115 = true; psCadc2Ac115 = true
        psCadc1Ac26 = true; psCadc2Ac26 = true
        psCadc1Test = "OFF"; psCadc2Test = "OFF"
        psPitotCaptCover = false; psPitotFoCover = false; psPitotAux1Cover = false; psPitotAux2Cover = false
        psPitotCaptBlocked = false; psPitotFoBlocked = false
        psStaticCaptL = false; psStaticCaptR = false; psStaticFoL = false; psStaticFoR = false
        icingConditions = false; psIcing = false
    }

    @Test fun standardAtmosphereAtSeaLevel() {
        val a = atmosphere(0.0)
        assertEquals(1013.25, a.pHpa, 0.01)
        assertEquals(288.15, a.tempK, 0.01)
    }

    @Test fun altitudeRoundTripsThroughStaticPressure() {
        assertEquals(10000.0, altitudeFromStatic(atmosphere(10000.0).pHpa), 1.0)
    }

    @Test fun casRoundTripsThroughImpactPressure() {
        assertEquals(250.0, casFromDynamicPressure(impactPressureFromCas(250.0)), 0.01)
        assertEquals(0.0, casFromDynamicPressure(0.0), 1e-9)
    }

    @Test fun machIsZeroWithoutDynamicPressure() {
        assertEquals(0.0, machFromDynamicPressure(0.0, 1013.25), 1e-9)
    }

    @Test fun icingIsRelievedOnlyByActualHeat() {
        assertTrue(pitotIced(icing = true, heatRequested = false, dcPower = true))
        assertTrue(!pitotIced(icing = true, heatRequested = true, dcPower = true))
        // heat requested but no AC: the heater is not actually on, so the probe still ices
        assertTrue(pitotIced(icing = true, heatRequested = true, dcPower = true, acPower = false))
        assertTrue(!pitotIced(icing = false, heatRequested = false, dcPower = true))
    }

    @Test fun barberPoleIsVmoAtSeaLevelAndMmoAtAltitude() {
        assertEquals(340.0, vmoMmoLimitKt(1013.25), 0.01)
        assertEquals(320.2, vmoMmoLimitKt(300.0), 1.0)
        assertEquals(340.0, vmoMmoLimitKt(Double.NaN), 1e-9)
    }

    @Test fun flightStateActivation() {
        assertTrue(!flightStateActive(initialSimState()))
        assertTrue(flightStateActive(initialSimState().apply { psTrainerEnabled = true }))
        assertTrue(flightStateActive(initialSimState().apply { wow = false; psFlightCasKt = 200.0 }))
    }

    @Test fun healthyAirDataReadsFlightConditions() {
        val d = computeAirData(healthy())
        assertEquals(250.0, d.capt.iasKt, 0.5)
        assertEquals(10000.0, d.capt.altFt, 2.0)
        assertTrue(d.capt.pitotOk && d.capt.staticOk && d.capt.adc.valid)
        assertEquals(250.0, d.fo.iasKt, 0.5)
        assertTrue(!d.disagree)
        assertEquals(10000.0, d.standby.altFt, 2.0)
    }

    @Test fun icingBlocksCaptainPitot() {
        val s = healthy().apply { icingConditions = true }
        val d = computeAirData(s)
        assertTrue(!d.capt.pitotOk)
        assertEquals(0.0, d.capt.iasKt, 1e-9)
        assertTrue(d.capt.flags.contains("PITOT ICE"))
    }

    @Test fun cadcFailureInvalidatesChannel() {
        val s = healthy().apply { psCadc1Test = "FAIL" }
        val d = computeAirData(s)
        assertTrue(!d.capt.adc.valid)
        assertEquals(0.0, d.capt.iasKt, 1e-9)
        assertTrue(d.capt.adc.data.flags.contains("CADC TEST FAIL"))
        assertTrue(d.fo.adc.valid)
    }

    @Test fun probeCoverBlocksAndFlagsInMotion() {
        val s = healthy().apply { psPitotCaptCover = true }
        val d = computeAirData(s)
        assertTrue(d.capt.probe.coverOn && !d.capt.pitotOk)
        assertTrue(d.capt.flags.contains("COVER"))
        assertTrue(d.coverOnInMotion)
    }
}
