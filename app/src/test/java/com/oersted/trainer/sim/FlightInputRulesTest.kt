package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightInputRules as R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FlightInputRulesTest {
    @Test fun groundPatchStopsAndLowersEverything() {
        val p = R.groundModePatch()
        assertEquals(true, p["wow"]); assertEquals(1.0, p["noseGearPos"]); assertEquals(0.0, p["psFlightAltFt"])
        assertEquals("DOWN", p["speedBrake"]); assertEquals(0.0, p["groundSpeedKt"])
    }

    @Test fun groundPatchKeysAreAllMapped() {
        val s = initialSimState()
        val n = SimPhaseWorld.applySim(s.copy().apply { wow = false; psFlightAltFt = 9000.0; yokePitch = 0.5 }, R.groundModePatch())
        assertTrue(n.wow); assertEquals(0.0, n.psFlightAltFt, 0.0); assertEquals(0.0, n.yokePitch, 0.0)
    }

    @Test fun airspeedAndAltitudePatchesWriteTargetsToo() {
        assertEquals(220.0, R.airspeedPatch(220.0)["groundSpeedKt"])
        assertEquals(220.0, R.airspeedPatch(220.0)["psFlightTargetCasKt"])
        assertEquals(8000.0, R.altitudePatch(8000.0)["psFlightTargetAltFt"])
    }

    @Test fun springReturnStepsToZeroAndSnaps() {
        assertEquals(0.7, R.springReturn(1.0, 0.1, R.YOKE_RATE), 1e-9)
        assertEquals(-0.7, R.springReturn(-1.0, 0.1, R.YOKE_RATE), 1e-9)
        assertEquals(0.0, R.springReturn(0.2, 0.1, R.YOKE_RATE), 1e-9)   // step 0.3 > 0.2
        assertEquals(0.0, R.springReturn(0.005, 0.01, R.YOKE_RATE), 0.0)
        assertEquals(0.78, R.springReturn(1.0, 0.1, R.TILLER_RATE), 1e-9)
    }

    @Test fun toeBrakeRampsUpAndDown() {
        assertEquals(0.22, R.toeBrake(0.0, true, 0.1), 1e-9)
        assertEquals(1.0, R.toeBrake(0.95, true, 0.1), 1e-9)
        assertEquals(0.0, R.toeBrake(0.3, false, 0.1), 1e-9)
        assertEquals(0.6, R.toeBrake(1.0, false, 0.1), 1e-9)
    }

    @Test fun yokeDragMapsAndClamps() {
        val g = R.yokeDragGain(1.0)
        assertEquals(2.8, g, 1e-9)
        assertEquals(2.8 / 0.2, R.yokeDragGain(0.01), 1e-9)
        assertEquals(0.28, R.yokeRollFromDrag(0.0, 10.0, g), 1e-9)
        assertEquals(1.0, R.yokeRollFromDrag(0.5, 500.0, g), 0.0)
        assertEquals(0.28, R.yokePitchFromDrag(0.0, -10.0, g), 1e-9)   // drag up = pitch up
        assertEquals(-1.0, R.yokePitchFromDrag(0.0, 500.0, g), 0.0)
    }

    @Test fun pedalDragOpposesBetweenSides() {
        assertEquals(-0.5, R.rudderFromPedalDrag(true, 0.0, 10.0), 1e-9)
        assertEquals(0.5, R.rudderFromPedalDrag(false, 0.0, 10.0), 1e-9)
        assertEquals(1.0, R.rudderFromPedalDrag(false, 0.8, 40.0), 0.0)
    }

    @Test fun tillerAngleAndDrag() {
        assertEquals(0.0, R.tillerAngleDeg(0.0, -10.0), 1e-9)
        assertEquals(90.0, R.tillerAngleDeg(10.0, 0.0), 1e-9)
        assertEquals(0.5, R.tillerFromDrag(0.0, 0.0, 39.0), 1e-9)
        assertEquals(1.0, R.tillerFromDrag(0.0, 0.0, 120.0), 0.0)
        // wrap: from +170 to -170 is +20 deg
        assertEquals(20.0 / 78.0, R.tillerFromDrag(170.0, 0.0, -170.0), 1e-9)
    }
}
