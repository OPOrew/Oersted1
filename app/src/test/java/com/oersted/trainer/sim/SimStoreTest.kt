package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Hand-written checks for SimStore and SimTick (store.ts tick, patch, reset, clearLog). */
class SimStoreTest {
    private fun fresh(configure: SimState.() -> Unit = {}): SimStore {
        val s = initialSimState()
        s.timeScale = 1.0
        s.configure()
        return SimStore(initial = s, clock = { 1000.0 })
    }

    @Test fun derivedIsCachedPerStateObject() {
        val store = fresh()
        val s = store.current()
        assertTrue(store.derived(s) === store.derived(s))
    }

    @Test fun updateWritesLogLineForChangedControl() {
        val store = fresh()
        val before = store.current().log.size
        store.update(changedKey = "battery", before = "false", after = "true") { it.battery = true }
        assertTrue(store.current().battery)
        assertEquals(before + 1, store.current().log.size)
        assertEquals("BATTERY → TRUE", store.current().log[0].text)
    }

    @Test fun updateWithNoteAndNoChangeKeepsStateDistinctCopy() {
        val store = fresh()
        val s0 = store.current()
        store.update { }
        assertTrue(store.current() !== s0) // a new committed object
        assertEquals(s0.battery, store.current().battery)
    }

    @Test fun listenersAreNotifiedAndCanUnsubscribe() {
        val store = fresh()
        var calls = 0
        val unsub = store.subscribe { calls++ }
        store.update(note = "one") { }
        assertEquals(1, calls)
        unsub()
        store.update(note = "two") { }
        assertEquals(1, calls)
    }

    @Test fun resetRestoresInitialState() {
        val store = fresh()
        store.update { it.battery = false }
        store.reset()
        assertEquals(initialSimState().battery, store.current().battery)
    }

    @Test fun clearLogEmptiesLog() {
        val store = fresh()
        store.clearLog()
        assertEquals(0, store.current().log.size)
    }

    @Test fun generatorProtectionLatchesAfterZeroFourSeconds() {
        val store = fresh {
            gen1 = true
            faults.generator1OverVoltage = true
        }
        // 0.1 s per tick at time scale 1: the timer reaches 0.40 s on the fourth tick.
        repeat(3) { store.tick(0.1) }
        assertTrue(!store.current().generator1ProtectionLatched)
        repeat(3) { store.tick(0.1) }
        assertTrue(store.current().generator1ProtectionLatched)
    }

    @Test fun oneTouchAutoStartMovesLeverToIdleAtTwentyPercentN2() {
        val store = fresh {
            autoStart1 = true
            start1 = "GRD"
            n2_1 = 25.0
            lever1 = false
        }
        store.tick(0.1)
        assertTrue(store.current().lever1)
        assertTrue(store.current().log.any { it.text.contains("START LEVER to IDLE") })
    }

    @Test fun hydraulicServicingFillsReservoirsOnGround() {
        val store = fresh {
            hydServicingConnected = true
            wow = true
            hydAQty = 50.0
        }
        store.tick(0.5)
        // The web step() adds 2.5 %/s (0.5 s -> 1.25) and the store tick adds 12 %/s (-> 6.0): 50 + 1.25 + 6 = 57.25.
        assertEquals(57.25, store.current().hydAQty, 0.01)
    }

    @Test fun testClockAdvancesOnlyWhenTrainerEnabled() {
        val on = fresh { psTrainerEnabled = true }
        on.tick(0.5)
        assertEquals(0.5, on.current().psTestClockSec, 1e-9)
        val off = fresh { psTrainerEnabled = false }
        off.tick(0.5)
        assertEquals(0.0, off.current().psTestClockSec, 1e-9)
    }
}
