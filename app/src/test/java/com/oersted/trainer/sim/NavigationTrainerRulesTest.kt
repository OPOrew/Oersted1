package com.oersted.trainer.sim

import com.oersted.trainer.sim.MipLocal.MipState
import com.oersted.trainer.sim.Pedestal.PedestalState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NavigationTrainerRulesTest {
    private val rules = NavigationTrainerRules

    @Test fun keyListsMatchTheWebGrids() {
        assertEquals(7, rules.SRC_FAIL_KEYS.size)
        assertEquals(19, rules.SRC_POWER_KEYS.size)
    }

    @Test fun everySourceFailKeyFlipsItsOwnFlagOnly() {
        val m = MipState()
        for (k in rules.SRC_FAIL_KEYS) {
            val t = rules.toggleSrcFail(m, k)
            val changed = listOf(t.srcFail.gyro1, t.srcFail.gyro2, t.srcFail.gyroAux, t.srcFail.comp1, t.srcFail.comp2, t.srcFail.nav1, t.srcFail.nav2)
            assertEquals(1, changed.count { it })
            assertFalse(m.srcFail.gyro1 || m.srcFail.nav2) // original untouched
        }
        val nav2 = rules.toggleSrcFail(m, "nav2")
        assertTrue(nav2.srcFail.nav2)
        assertFalse(rules.toggleSrcFail(nav2, "nav2").srcFail.nav2)
    }

    private fun openBreakers(m: MipState): Int = with(m.srcPower) {
        listOf(gyro1Cb, gyro2Cb, gyroAuxCb, comp1Cb, comp2Cb, nav1Cb, nav2Cb, nav1GsCb, nav2GsCb,
            dme1Cb, dme2Cb, adf1Cb, adf2Cb, comm1Cb, comm2Cb, hf1Cb, hf2Cb, lrra1Cb, lrra2Cb).count { !it }
    }

    @Test fun everyBreakerKeyOpensItsOwnBreakerOnly() {
        val m = MipState()
        assertEquals(0, openBreakers(m)) // all closed by default
        for (k in rules.SRC_POWER_KEYS) {
            val t = rules.toggleSrcPower(m, k)
            assertEquals("$k: exactly one breaker opens", 1, openBreakers(t))
            assertEquals("$k: pressing again closes it", 0, openBreakers(rules.toggleSrcPower(t, k)))
        }
        assertTrue(rules.toggleSrcPower(m, "hf2Cb").srcPower.hf2Cb.not())
    }

    @Test fun unknownKeysAreRefused() {
        var refused = 0
        try { rules.toggleSrcFail(MipState(), "gyro9") } catch (e: IllegalArgumentException) { refused++ }
        try { rules.toggleSrcPower(MipState(), "nope") } catch (e: IllegalArgumentException) { refused++ }
        assertEquals(2, refused)
    }

    @Test fun fastErectAndCompSyncFlags() {
        val m = MipState()
        assertTrue(rules.toggleGyroFastErect(m).srcPower.gyroFastErect)
        assertTrue(rules.toggleCompSyncFlag(m, comp1 = true).compSyncFlag.c1)
        assertFalse(rules.toggleCompSyncFlag(m, comp1 = true).compSyncFlag.c2)
        assertTrue(rules.toggleCompSyncFlag(m, comp1 = false).compSyncFlag.c2)
    }

    @Test fun compModesCycleZeroAndOne() {
        val p = PedestalState()
        assertEquals(Pair(1, 0), rules.toggleCompMode1(p).compMode)
        assertEquals(Pair(0, 1), rules.toggleCompMode2(p).compMode)
        assertEquals(Pair(0, 0), rules.toggleCompMode1(rules.toggleCompMode1(p)).compMode)
    }

    @Test fun rmiNeedlesCycleVorAndAdf() {
        val p = PedestalState()
        assertEquals(Pair(1, 0), rules.toggleRmiNeedle1(p).rmiNeedle1)
        assertEquals(Pair(0, 0), rules.toggleRmiNeedle1(rules.toggleRmiNeedle1(p)).rmiNeedle1)
        assertEquals(Pair(0, 1), rules.toggleRmiNeedle2(p).rmiNeedle2)
    }

    @Test fun lrraTestTogglesEachChannel() {
        val p = PedestalState()
        assertEquals(Pair(true, false), rules.toggleLrraTest(p, first = true).lrraTest)
        assertEquals(Pair(false, true), rules.toggleLrraTest(p, first = false).lrraTest)
    }
}
