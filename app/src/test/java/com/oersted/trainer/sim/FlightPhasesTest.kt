package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Test

/** Hand-written checks for the pure helpers in FlightPhases (flightPhases.ts). */
class FlightPhasesTest {
    @Test fun fieldElevationKnownAndUnknown() {
        assertEquals(75.0, FlightPhases.fieldElev("RPLL"), 0.0)
        assertEquals(22.0, FlightPhases.fieldElev("WSSS"), 0.0)
        assertEquals(0.0, FlightPhases.fieldElev("XXXX"), 0.0)
    }

    @Test fun speedConversionsRoundTripAndScaleWithAltitude() {
        // At sea level TAS equals CAS.
        assertEquals(150.0, FlightPhases.tasFromCas(150.0, 0.0), 1e-9)
        // At 10,000 ft: factor 1 + 10 * 0.016 = 1.16.
        assertEquals(174.0, FlightPhases.tasFromCas(150.0, 10000.0), 1e-9)
        assertEquals(150.0, FlightPhases.casFromTas(174.0, 10000.0), 1e-9)
    }

    @Test fun clampLimits() {
        assertEquals(0.0, FlightPhases.clamp(-5.0, 0.0, 10.0), 0.0)
        assertEquals(10.0, FlightPhases.clamp(15.0, 0.0, 10.0), 0.0)
        assertEquals(4.0, FlightPhases.clamp(4.0, 0.0, 10.0), 0.0)
    }

    @Test fun climbPerformanceFullTanksAndEmpty() {
        // Full tanks: 82,000 + 38,000 = 120,000 lb; weight factor 1 - 20000/130000; temp factor 0.9595.
        val full = FlightPhases.climbPerformance(100.0, 100.0, 100.0)
        assertEquals(120000.0, full.weightLb, 0.0)
        val expectedFull = (1 - 20000.0 / 130000) * (1 - 0.0027 * 15)
        assertEquals(expectedFull, full.factor, 1e-12)
        // Empty tanks: 82,000 lb, weight factor clamped at the 1.08 ceiling.
        val empty = FlightPhases.climbPerformance(0.0, 0.0, 0.0)
        assertEquals(82000.0, empty.weightLb, 0.0)
        assertEquals(1.08 * (1 - 0.0027 * 15), empty.factor, 1e-12)
    }

    @Test fun climbPerformanceClampsTankPercentages() {
        val over = FlightPhases.climbPerformance(250.0, -10.0, 100.0)
        val capped = FlightPhases.climbPerformance(100.0, 0.0, 100.0)
        assertEquals(capped.weightLb, over.weightLb, 0.0)
        assertEquals(capped.factor, over.factor, 1e-12)
    }

    @Test fun descentTargetUsesFixAltitudeOrDefault() {
        assertEquals(5000.0, FlightPhases.descentTargetFt(5000.0), 0.0)
        assertEquals(3000.0, FlightPhases.descentTargetFt(null), 0.0)
        assertEquals(3000.0, FlightPhases.descentTargetFt(0.0), 0.0)
    }

    @Test fun phaseConfigCoversEveryPhase() {
        for (p in FlightPhases.Phase.values()) {
            assertEquals(true, FlightPhases.PHASE_CONFIG.containsKey(p))
        }
        assertEquals("-", FlightPhases.PHASE_CONFIG[FlightPhases.Phase.NO_PLAN])
    }
}
