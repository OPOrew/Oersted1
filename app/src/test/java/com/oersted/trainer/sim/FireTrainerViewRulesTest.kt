package com.oersted.trainer.sim

import com.oersted.trainer.sim.FireTrainerViewRules as F
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FireTrainerViewRulesTest {
    private fun st() = initialSimState()
    private fun dv(s: SimState = st()) = Derived()

    @Test fun engineStatesAndTones() {
        val s = st(); val d = dv(s)
        assertEquals("SHUT DOWN", F.engineState(F.eng(s, d, 1)))
        s.faults.engineFire1 = true
        assertEquals("FIRE", F.engineState(F.eng(s, d, 1))); assertEquals("warn", F.engineTone(F.eng(s, d, 1)))
        s.engine1FirePulled = true
        assertEquals("FIRE · HANDLE PULLED", F.engineState(F.eng(s, d, 1)))
        s.faults.engineFire1 = false
        assertEquals("SHUT DOWN · HANDLE PULLED", F.engineState(F.eng(s, d, 1))); assertEquals("caution", F.engineTone(F.eng(s, d, 1)))
        assertEquals(F.SUB, F.loopColor(false, true)); assertEquals(F.OK, F.loopColor(false, false)); assertEquals(F.WARN, F.loopColor(true, true))
        assertEquals("LOOPS · HANDLE PULLED", F.engineLoopLabel(F.eng(s, d, 1)))
    }

    @Test fun fuelFlowNeedsLeverN2AndNoPulledHandle() {
        val s = st(); val d = dv(s)
        s.lever1 = true; s.n2_1 = 19.0
        assertTrue(F.eng(s, d, 1).fuel)
        s.n2_1 = 18.0; assertFalse(F.eng(s, d, 1).fuel)
        s.n2_1 = 60.0; s.engine1FirePulled = true; assertFalse(F.eng(s, d, 1).fuel)
        assertEquals("CUT OFF", F.engineChips(F.eng(s, d, 1))[0].text)
        assertEquals("Pulled · reset", F.engineHandleLabel(F.eng(s, d, 1)))
    }

    @Test fun chipTextDefaultsToOnOff() {
        assertEquals("ON", F.ChipData("X", true).text); assertEquals("OFF", F.ChipData("X", false).text); assertEquals("5", F.ChipData("X", false, "5").text)
    }

    @Test fun mitigationListsAppearWithFire() {
        val s = st(); val d = dv(s)
        assertTrue(F.mitigation(s, d).isEmpty())
        s.faults.engineFire2 = true
        val m = F.mitigation(s, d)
        assertEquals(1, m.size); assertEquals("ENG 2 FIRE / SEVERE DAMAGE", m[0].title); assertEquals(5, m[0].steps.size)
        assertFalse(m[0].steps[1].second)                       // handle not pulled
        s.engine2FirePulled = true; s.fireBottleLDischarged = true; s.faults.engineFire2 = false
        val m2 = F.mitigation(s, d)[0]
        assertTrue(m2.steps.all { it.second })
        s.wheelWellFire = true; s.gear = "UP"; s.noseGearPos = 0.0; s.leftMainGearPos = 0.0; s.rightMainGearPos = 0.0
        val w = F.mitigation(s, d).first { it.title == "WHEEL WELL FIRE" }
        assertFalse(w.steps[0].second); assertFalse(w.steps[1].second)
        s.cargoFwdLevel = 0.2; s.cargoAftLevel = 0.5
        assertEquals("CARGO FIRE / SMOKE (AFT)", F.mitigation(s, d).last().title)
    }

    @Test fun lostLinesAndAnyFire() {
        val s = st(); val d = dv(s)
        assertTrue(F.lost(s, d).isEmpty()); assertFalse(F.anyFire(s))
        s.engine1FirePulled = true; s.apuFirePulled = true
        val l = F.lost(s, d)
        assertEquals("GEN 1 off bus", l[0]); assertEquals("HYD A pump 1 no supply", l[1]); assertEquals("L bleed lost", l[2]); assertEquals("APU bleed lost", l.last())
        s.cargoAftFire = true; assertTrue(F.anyFire(s))
        assertTrue(F.emptyMitigationText(s).startsWith("Fire active."))
    }

    @Test fun cargoAndWellStates() {
        val s = st()
        s.cargoFireInstalled = false
        assertEquals("NOT INSTALLED (pre-SB 26A1081)", F.cargoState(s, true, true)); assertEquals("N/A", F.cargoChips(s)[0].text)
        s.cargoFireInstalled = true
        assertEquals("SMOKE / FIRE DETECTED", F.cargoState(s, true, false)); assertEquals("warn", F.cargoTone(s, true, false))
        s.cargoBottleDischarged = true; assertEquals("AGENT DISCHARGED", F.cargoState(s, false, false))
        assertEquals("NORMAL", F.wheelWellState(s)); s.wheelWellLevel = 0.3; assertEquals("COOLING", F.wheelWellState(s))
        s.wheelWellFire = true; assertEquals("OVERHEAT WARNING", F.wheelWellState(s))
        s.noseGearPos = 1.0; s.leftMainGearPos = 1.0; s.rightMainGearPos = 1.0
        assertEquals("DOWN LOCKED", F.wheelWellChips(s)[0].text); assertEquals("30%", F.wheelWellChips(s)[2].text)
    }

    @Test fun flameGeometryAndSweep() {
        val f = F.flames(100.0, 50.0, 100.0, 3, 1.0)
        assertEquals(3, f.size)
        val w = 42.0
        assertEquals(100 - w * 1.15 - w, f[0].outer[0], 1e-9)       // flame 0 left foot
        assertEquals(50 - 100.0, f[0].outer[7], 1e-9)               // tip at base - h (h = 100)
        assertEquals(50 - 80.0, f[1].outer[7], 1e-9)                // odd flames 80 % tall
        assertEquals(0.45 + 0.26, f[2].outerDur, 1e-9); assertEquals(0.38 + 0.22, f[2].innerDur, 1e-9)
        val m = F.mistPuff(10.0, 20.0, 100.0, 1)
        assertEquals(10 + (-1) * 55.0, m[0], 1e-9); assertEquals(20 - 25.0, m[1], 1e-9); assertEquals(68.0, m[2], 1e-9)
        assertEquals(0.95, F.sweep(0.0, 2.0, 0.95, 0.5), 1e-9); assertEquals(0.5, F.sweep(1.0, 2.0, 0.95, 0.5), 1e-9); assertEquals(0.95, F.sweep(2.0, 2.0, 0.95, 0.5), 1e-9)
    }

    @Test fun warningLightsNeedDcForTest() {
        val s = st(); val d = dv(s)
        assertTrue(F.warningLights(s, d, true).none { it.second })      // no DC
        d.dcPower = true
        assertTrue(F.warningLights(s, d, true).take(7).all { it.second })
        assertEquals(8, F.warningLights(s, d, false).size)
    }
}
