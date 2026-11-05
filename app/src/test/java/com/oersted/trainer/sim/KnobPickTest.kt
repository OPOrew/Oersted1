package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class KnobPickTest {
    private val marks = listOf(-90.0, 0.0, 90.0)

    @Test fun pointerAngleIsZeroUpClockwisePositive() {
        assertEquals(0.0, KnobPick.pointerAngleDeg(0.0, -10.0), 1e-9)
        assertEquals(90.0, KnobPick.pointerAngleDeg(10.0, 0.0), 1e-9)
        assertEquals(-90.0, KnobPick.pointerAngleDeg(-10.0, 0.0), 1e-9)
    }

    @Test fun nearestMarkWinsAndTiesKeepTheLowerIndex() {
        assertEquals(0, KnobPick.nearestMark(-80.0, marks))
        assertEquals(2, KnobPick.nearestMark(60.0, marks))
        assertEquals(0, KnobPick.nearestMark(-45.0, marks)) // exactly between -90 and 0: first wins
    }

    @Test fun pressOnTheSameMarkChangesNothing() {
        assertTrue(KnobPick.pressedValue(1, 2.0, marks) == null)
        assertEquals(2, KnobPick.pressedValue(1, 80.0, marks))
    }

    @Test fun keyboardStepIsClamped() {
        assertEquals(2, KnobPick.stepped(2, 1, 3))
        assertEquals(0, KnobPick.stepped(0, -1, 3))
        assertEquals(2, KnobPick.stepped(1, 1, 3))
    }

    @Test fun pointerFollowsTheValueAndClampsOutOfRange() {
        assertEquals(0.0, KnobPick.pointerAngleFor(1, marks), 0.0)
        assertEquals(90.0, KnobPick.pointerAngleFor(9, marks), 0.0)
        assertEquals(0.0, KnobPick.pointerAngleFor(0, emptyList()), 0.0)
    }

    @Test fun fdAndPitchMarkTablesHaveTheRightSizes() {
        assertEquals(6, KnobPick.FD_MODE_ANGLES.size)
        assertEquals(21, KnobPick.PITCH_CMD_ANGLES.size)
        assertEquals(-105.0, KnobPick.PITCH_CMD_ANGLES.first(), 1e-9)
        assertEquals(105.0, KnobPick.PITCH_CMD_ANGLES.last(), 1e-9)
        assertTrue(KnobPick.FD_MODE_ANGLES.zipWithNext().all { (a, b) -> a < b })
    }
}
