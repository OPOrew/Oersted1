package com.oersted.trainer.sim

import com.oersted.trainer.sim.MipLocal.MipState
import com.oersted.trainer.sim.Pedestal.PedestalState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WarningReducerTest {
    @Test fun ackCancelsRecall() {
        val s = WarningReducer.ackMasterCaution(MipState(recall = true))
        assertTrue(s.masterCautionAck)
        assertFalse(s.recall)
    }

    @Test fun ackClearsWhenTheCautionClears() {
        val acked = MipState(masterCautionAck = true)
        assertFalse(WarningReducer.syncCautionAck(acked, masterCaution = false).masterCautionAck)
        assertTrue(WarningReducer.syncCautionAck(acked, masterCaution = true).masterCautionAck)
        val plain = MipState(masterCautionAck = false)
        assertEquals(plain, WarningReducer.syncCautionAck(plain, masterCaution = false))
    }

    @Test fun silenceCutsTheBell() {
        assertTrue(WarningReducer.silenceBell(PedestalState()).bellSilenced)
    }
}
