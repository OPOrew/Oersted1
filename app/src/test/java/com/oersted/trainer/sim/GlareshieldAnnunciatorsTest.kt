package com.oersted.trainer.sim

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlareshieldAnnunciatorsTest {
    private val A = GlareshieldAnnunciators

    @Test fun testNeedsPowerAndAnyTestSource() {
        assertTrue(A.testActive(pw = true, ltTest = true, recall = false, lightKeyTest = false, annTest = 0))
        assertTrue(A.testActive(pw = true, ltTest = false, recall = false, lightKeyTest = false, annTest = 1))
        assertFalse(A.testActive(pw = false, ltTest = true, recall = true, lightKeyTest = true, annTest = 1))
        assertFalse(A.testActive(pw = true, ltTest = false, recall = false, lightKeyTest = false, annTest = 0))
    }

    @Test fun systemLampNeedsPower() {
        assertTrue(A.systemLamp(pw = true, condition = true, test = false))
        assertTrue(A.systemLamp(pw = true, condition = false, test = true))
        assertFalse(A.systemLamp(pw = false, condition = true, test = true))
    }

    @Test fun cautionIsPendingUntilAcknowledged() {
        assertTrue(A.cautionPending(masterCaution = true, masterCautionAck = false))
        assertFalse(A.cautionPending(masterCaution = true, masterCautionAck = true))
        assertFalse(A.cautionPending(masterCaution = false, masterCautionAck = false))
    }

    @Test fun fireWarnRespectsTheBellCutOutButNotTheOvhtFireTest() {
        assertTrue(A.fireWarnLit(pw = true, fireWarning = true, bellSilenced = false, fireTestOvhtFire = false))
        assertFalse(A.fireWarnLit(pw = true, fireWarning = true, bellSilenced = true, fireTestOvhtFire = false))
        assertTrue(A.fireWarnLit(pw = true, fireWarning = false, bellSilenced = true, fireTestOvhtFire = true))
        assertFalse(A.fireWarnLit(pw = false, fireWarning = true, bellSilenced = false, fireTestOvhtFire = true))
    }

    @Test fun anyFireSourceCounts() {
        assertTrue(A.anyFireWarning(false, false, false, false, false, true))
        assertFalse(A.anyFireWarning(false, false, false, false, false, false))
    }

    @Test fun faultTestLightsMasterCautionOnly() {
        assertTrue(A.masterCautionLit(pw = true, cautionPending = false, recall = false, ltTest = false,
            lightKeyTest = false, fireTestOvhtFire = false, fireTestFault = true))
        assertFalse(A.fireWarnLit(pw = true, fireWarning = false, bellSilenced = false, fireTestOvhtFire = false))
    }

    @Test fun windshearAndAntiIce() {
        assertTrue(A.windshearLit(pw = true, ltTest = false, raTest = true, lightKeyTest = false))
        assertFalse(A.windshearLit(pw = true, ltTest = false, raTest = false, lightKeyTest = false))
        assertTrue(A.antiIceProblem(antiIce1 = true, bleed1Available = false, antiIce2 = false, bleed2Available = true,
            alphaVaneFailL = false, alphaVaneFailR = false))
        assertFalse(A.antiIceProblem(antiIce1 = true, bleed1Available = true, antiIce2 = true, bleed2Available = true,
            alphaVaneFailL = false, alphaVaneFailR = false))
        assertTrue(A.antiIceProblem(antiIce1 = false, bleed1Available = false, antiIce2 = false, bleed2Available = false,
            alphaVaneFailL = false, alphaVaneFailR = true))
    }
}
