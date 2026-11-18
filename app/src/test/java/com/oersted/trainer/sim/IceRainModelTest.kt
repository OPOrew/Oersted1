package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class IceRainModelTest {
    private val m = IceRainModel
    private val none = mapOf("L" to 0.0, "R" to 0.0)

    private fun inputs(
        speed: Double = 1.0, icing: Boolean = false, rain: Boolean = false, oat: Double = 75.0,
        win: Set<String> = emptySet(), testPwr: Boolean = false, probes: Set<String> = emptySet(),
        valveL: Boolean = false, hotL: Boolean = false, cowl1: Boolean = false,
    ) = IceRainModel.IceInputs(
        speed, icing, rain, oat,
        m.WIN_IDS.associateWith { it in win }, testPwr,
        m.PROBE_IDS.associateWith { it in probes },
        mapOf("L" to valveL, "R" to false), mapOf("L" to hotL, "R" to false), mapOf(1 to cowl1, 2 to false),
    )

    @Test fun initialStateIsColdAndClear() {
        val st = m.initialState(60.0)
        assertEquals(60.0, st.win.getValue("L1").t, 0.0)
        assertEquals(99.0, st.win.getValue("R5").offT, 0.0)
        assertTrue(st.win.getValue("L4").heat)
        assertEquals(0.0, m.iceTotal(st), 0.0)
    }

    @Test fun majorWindowRampsPowerAndWarmsGlass() {
        // one second at 75 F: ramp = 1/180, p = ramp (the 114 F target is far away), t gains 0.5556 * (1 - e^-0.02)
        val st = m.step(m.initialState(75.0), inputs(win = setOf("L1")), 1.0, none)
        val w = st.win.getValue("L1")
        assertEquals(1.0 / 180, w.ramp, 1e-9)
        assertEquals(1.0 / 180, w.p, 1e-9)
        assertEquals(75.0110007, w.t, 1e-6)
        assertEquals(0.0, w.offT, 0.0)
    }

    @Test fun majorWindowTripsAbove145AndCutsPower() {
        val prev = m.initialState(75.0)
        val hot = prev.copy(win = prev.win + ("L1" to prev.win.getValue("L1").copy(t = 146.0, ramp = 1.0)))
        val w = m.step(hot, inputs(win = setOf("L1")), 1.0, none).win.getValue("L1")
        assertTrue(w.trip)
        assertEquals(0.0, w.p, 0.0)
        // switching it off (not enabled) clears the trip
        assertFalse(m.step(hot.copy(win = hot.win + ("L1" to w)), inputs(), 1.0, none).win.getValue("L1").trip)
    }

    @Test fun testPwrForcesFullPower() {
        val w = m.step(m.initialState(75.0), inputs(win = setOf("R2"), testPwr = true), 1.0, none).win.getValue("R2")
        assertEquals(1.0, w.p, 0.0)
    }

    @Test fun eyebrowWindowsUseTheThermalSwitch() {
        val prev = m.initialState(75.0)
        fun at(t: Double, heat: Boolean) = prev.copy(win = prev.win + ("L4" to prev.win.getValue("L4").copy(t = t, heat = heat)))
        val open = m.step(at(111.0, true), inputs(win = setOf("L4")), 1.0, none).win.getValue("L4")
        assertFalse(open.heat); assertEquals(0.0, open.p, 0.0)
        val close = m.step(at(89.0, false), inputs(win = setOf("L4")), 1.0, none).win.getValue("L4")
        assertTrue(close.heat); assertEquals(1.0, close.p, 0.0)
        // between 90 and 110 the contact keeps its state
        assertTrue(m.step(at(100.0, true), inputs(win = setOf("L4")), 1.0, none).win.getValue("L4").heat)
    }

    @Test fun rampResetsAfterFiveSecondsOff() {
        var st = m.initialState(75.0)
        st = st.copy(win = st.win + ("L1" to st.win.getValue("L1").copy(ramp = 0.8)))
        st = m.step(st, inputs(), 4.0, none)
        assertEquals(0.8, st.win.getValue("L1").ramp, 0.0)
        st = m.step(st, inputs(), 2.0, none)
        assertEquals(0.0, st.win.getValue("L1").ramp, 0.0)
    }

    @Test fun icingBuildsOnColdGlassAndMeltsOnWarm() {
        val cold = m.step(m.initialState(75.0), inputs(icing = true), 3.0, none)
        // OAT is held at 25 F in icing, glass cools slightly but is still above 38 F after 3 s, so no ice yet
        assertEquals(0.0, cold.win.getValue("L1").ice, 0.0)
        val chilled = m.initialState(20.0)
        val frosted = m.step(chilled, inputs(icing = true, oat = 20.0), 3.0, none)
        assertEquals(0.1, frosted.win.getValue("L1").ice, 1e-9)
        val melt = frosted.copy(win = frosted.win + ("L1" to frosted.win.getValue("L1").copy(t = 100.0, ice = 0.5)))
        val after = m.step(melt, inputs(oat = 100.0), 5.0, none).win.getValue("L1").ice
        assertEquals(0.5 - 5 * (0.02 + 62.0 / 1500), after, 1e-9)
    }

    @Test fun rainWettensNo1WindowAndWipersClearIt() {
        val wet = m.step(m.initialState(75.0), inputs(rain = true), 2.0, none).win.getValue("L1").wet
        assertEquals(0.25 * 2 - 0.015 * 2, wet, 1e-9)
        val wiped = m.step(m.initialState(75.0).let { it.copy(win = it.win + ("L1" to it.win.getValue("L1").copy(wet = 0.5))) },
            inputs(), 1.0, mapOf("L" to 0.5, "R" to 0.0)).win.getValue("L1").wet
        assertEquals(0.5 - 0.5 * 0.35 - 0.015, wiped, 1e-9)
        // repellent reduces the rain rate by up to 80%
        val rep = m.spray(m.initialState(75.0), "L")
        assertEquals(1.0, rep.repel.getValue("L"), 0.0)
        val withRep = m.step(rep, inputs(rain = true), 1.0, none)
        assertEquals(0.25 * 0.2 - 0.015, withRep.win.getValue("L1").wet, 1e-9)
        assertEquals(1.0 - 1.0 / 45, withRep.repel.getValue("L"), 1e-9)
    }

    @Test fun probesIceUpWhenUnheatedAndClearWhenHeated() {
        val iced = m.step(m.initialState(75.0), inputs(icing = true), 10.0, none)
        assertEquals(0.2, iced.probe.getValue("capt"), 1e-9)
        val cleared = m.step(iced, inputs(icing = true, probes = setOf("capt")), 1.0, none)
        assertEquals(0.2 - 1.0 / 7, cleared.probe.getValue("capt"), 1e-9)
        assertEquals(0.2 + 1.0 / 50, cleared.probe.getValue("fo"), 1e-9)
    }

    @Test fun wingValveTravelsInThreeSecondsAndSlatsClearOnlyWithHotAir() {
        var st = m.initialState(75.0)
        st = m.step(st, inputs(valveL = true, hotL = true), 1.0, none)
        assertEquals(1.0 / 3, st.valve.getValue("L"), 1e-9)
        st = m.step(st, inputs(valveL = true, hotL = true), 2.0, none)
        assertEquals(1.0, st.valve.getValue("L"), 1e-9)
        // slat ice: open valve without hot air does not heat; with hot air it clears at 1/20 per second
        val icy = st.copy(slat = mapOf("L" to 0.5, "R" to 0.5))
        assertEquals(0.5, m.step(icy, inputs(valveL = true, hotL = false), 1.0, none).slat.getValue("L"), 1e-9)
        assertEquals(0.5 - 1.0 / 20, m.step(icy, inputs(valveL = true, hotL = true), 1.0, none).slat.getValue("L"), 1e-9)
    }

    @Test fun cowlClearsWhenHeatedAndFreezesInIcing() {
        val icy = m.initialState(75.0).copy(cowl = mapOf(1 to 0.5, 2 to 0.5))
        val st = m.step(icy, inputs(icing = true, cowl1 = true), 1.0, none)
        assertEquals(0.5 - 1.0 / 15, st.cowl.getValue(1), 1e-9)
        assertEquals(0.5 + 1.0 / 50, st.cowl.getValue(2), 1e-9)
    }

    @Test fun timeScaleSpeedsThermalButNotValveOrRepellent() {
        val a = m.step(m.initialState(75.0), inputs(speed = 10.0, win = setOf("L1")), 1.0, none)
        assertEquals(10.0 / 180, a.win.getValue("L1").ramp, 1e-9)
        val v = m.step(m.initialState(75.0), inputs(speed = 10.0, valveL = true), 1.0, none)
        assertEquals(1.0 / 3, v.valve.getValue("L"), 1e-9)
    }

    @Test fun wiperPhaseRunsAtItsSpeedAndParksAtHighSpeed() {
        val low = m.wiperStep(0.0, "LOW", 0.5)
        assertEquals(0.5, low.phase, 1e-9)           // 120/120 * 0.5
        assertEquals(2.0, low.strokesPerSec, 1e-9)
        val wrap = m.wiperStep(0.9, "HIGH", 0.5)      // 0.9 + 250/120*0.5 = 1.9417 -> 0.9417
        assertEquals(0.9 + 250.0 / 120 * 0.5 - 1, wrap.phase, 1e-9)
        // PARK at phase 0 does nothing
        assertEquals(0.0, m.wiperStep(0.0, "PARK", 0.5).strokesPerSec, 0.0)
        // PARK mid-stroke drives home at high speed and lands on 0
        val park = m.wiperStep(0.7, "PARK", 0.5)
        assertEquals(0.0, park.phase, 0.0)
        assertEquals(250.0 / 60, park.strokesPerSec, 1e-9)
        assertEquals(0.0, m.wiperAngle(0.0), 1e-9)
        assertEquals(84.0, m.wiperAngle(0.5), 1e-9)
    }

    @Test fun overheatLatchOrTestHeldWithSwitch() {
        val s = initialSimState()
        assertFalse(m.overheat(s).getValue("L1"))
        s.windowHeatTest = "OVHT"
        assertFalse(m.overheat(s).getValue("L1"))   // test held but the FWD switch is off
        s.windowHeatLFwd = true
        assertTrue(m.overheat(s).getValue("L1"))
        s.windowHeatTest = "OFF"; s.windowHeatOvhtRSide = true
        assertTrue(m.overheat(s).getValue("R2"))
        assertFalse(m.overheat(s).getValue("L4"))
    }

    @Test fun windowEnablesFollowTheGeneratorFeedPattern() {
        val s = initialSimState()
        s.windowHeatLFwd = true; s.windowHeatLSide = true; s.windowHeatRSide = true
        // source 1 live, source 2 dead: L1 (ac1) and R2 (ac1) heat, L2 (ac2) and R4 (ac2) do not
        val e = m.winEnabled(s, ac1 = true, ac2 = false, ovht = m.overheat(s))
        assertTrue(e.getValue("L1")); assertTrue(e.getValue("R2")); assertTrue(e.getValue("L4"))
        assertFalse(e.getValue("L2")); assertFalse(e.getValue("R4"))
        s.circuitBreakers["window-heat-left"] = false
        assertFalse(m.winEnabled(s, true, true, m.overheat(s)).getValue("L1"))
        s.circuitBreakers["window-heat-left"] = true
        s.faults.windowHeatFailureL = true
        assertFalse(m.winEnabled(s, true, true, m.overheat(s)).getValue("L1"))
    }

    @Test fun probeHeatNeedsAcDcSwitchAndBreakers() {
        val s = initialSimState()
        s.probeHeatCaptPitot = true; s.probeHeatTemp = true
        val on = m.probeHeated(s, ac = true, dc = true, alphaVaneHeatedL = false, alphaVaneHeatedR = true)
        assertTrue(on.getValue("capt")); assertTrue(on.getValue("temp"))
        assertFalse(on.getValue("fo")); assertFalse(on.getValue("alphaL")); assertTrue(on.getValue("alphaR"))
        s.psCbTempR = false
        assertFalse(m.probeHeated(s, true, true, false, false).getValue("temp"))
        assertFalse(m.probeHeated(s, ac = false, dc = true, alphaVaneHeatedL = false, alphaVaneHeatedR = false).getValue("capt"))
    }

    @Test fun wingValveCommandIsInhibitedOnTheGroundUnlessTesting() {
        val s = initialSimState()
        s.wingAntiIceL = true
        assertEquals(false, m.valveCmd(s, ac = true, wow = true, wingTest = false)["L"])
        assertEquals(true, m.valveCmd(s, ac = true, wow = false, wingTest = false)["L"])
        assertEquals(true, m.valveCmd(s, ac = true, wow = true, wingTest = true)["R"])
        assertEquals(false, m.valveCmd(s, ac = false, wow = false, wingTest = true)["L"])
        assertEquals(true, m.hotAir(8.5, 8.0)["L"]); assertEquals(false, m.hotAir(8.5, 8.0)["R"])
    }

    @Test fun cowlHeatNeedsBleed() {
        val s = initialSimState(); s.antiIce1 = true; s.antiIce2 = true
        val open = m.cowlOpen(s, ac = true)
        val heated = m.cowlHeated(open, bleed1Available = true, bleed2Available = false)
        assertEquals(true, heated[1]); assertEquals(false, heated[2]); assertEquals(true, open[2])
    }

    @Test fun valveLightDimBrightOff() {
        assertEquals("off", m.valveLight(0.0, false, false, dc = true))
        assertEquals("dim", m.valveLight(1.0, true, false, dc = true))
        assertEquals("bright", m.valveLight(0.0, true, false, dc = true))      // switch on, valve shut (ground inhibit)
        assertEquals("bright", m.valveLight(0.5, true, false, dc = true))      // in transit
        assertEquals("bright", m.valveLight(1.0, false, false, dc = true))     // open but switch off
        assertEquals("off", m.valveLight(0.5, true, false, dc = false))
        assertEquals("dim", m.valveLight(1.0, false, true, dc = true))         // TEST held
    }

    @Test fun chipTextsUseJsRounding() {
        val a = IceRainModel.WinState(106.5, 0.0, 0.0, 0.49, true, false, 0.0, 0.0)
        val b = a.copy(t = 100.0, p = 0.9)
        assertEquals("107°F · 49%", m.winChipValue(a))
        assertEquals("103°F · 90%", m.winChipValue(a, b))   // (106.5 + 100) / 2 = 103.25, max power 0.9
        assertEquals(25L, m.oatShown(true, 60.0))
        assertEquals(60L, m.oatShown(false, 60.0))
        assertEquals(75L, m.oatShown(false, null))
        assertEquals(10L, m.oatShown(true, 10.0))
    }

    @Test fun iceTotalIsTheLargestFraction() {
        val st = m.initialState(75.0).copy(slat = mapOf("L" to 0.3, "R" to 0.1), cowl = mapOf(1 to 0.6, 2 to 0.0))
        assertEquals(0.6, m.iceTotal(st), 0.0)
    }
}
