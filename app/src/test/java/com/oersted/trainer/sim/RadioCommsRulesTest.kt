package com.oersted.trainer.sim

import com.oersted.trainer.sim.RadioCommsRules as R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RadioCommsRulesTest {
    private val mip = MipLocal.MipState()
    private fun d(dc: Boolean) = Derived().apply { dcPower = dc }
    private fun ped(vararg on: String, ptt: Boolean = false, test: Boolean = false, l: Int = 121950, r: Int = 119100) =
        Pedestal.PedestalState(mic = Pedestal.MIC_DEFAULT.mapValues { false } + on.associateWith { true }, ptt = ptt, commTest = test, commL = Pedestal.Freq(l, 121800), commR = Pedestal.Freq(r, 121500))
    private fun st(p: Pedestal.PedestalState, dc: Boolean = true, s: SimState = initialSimState()) = R.state(p, mip, s, d(dc))

    @Test fun formatAndGain() {
        assertEquals("121.950 MHz", R.formatMHz(121950)); assertEquals("119.100 MHz", R.formatMHz(119100))
        val base = st(ped())
        assertEquals(0.16, R.hissGain(base, 0.16f).toDouble(), 1e-6)
        assertEquals(0.352, R.hissGain(st(ped(test = true)), 0.16f).toDouble(), 1e-5)
        assertEquals(0.112, R.hissGain(st(ped("L:tx:VHF-1", ptt = true)), 0.16f).toDouble(), 1e-5)
        assertEquals(0.12, R.hissGain(st(ped("L:tx:VHF-1", ptt = true)), 0.5f).toDouble(), 1e-6)
        assertEquals(0.48, R.speechVolume(0.16f).toDouble(), 1e-6); assertEquals(1.0, R.speechVolume(0.5f).toDouble(), 0.0); assertEquals(0.1, R.speechVolume(0.02f).toDouble(), 1e-6)
    }

    @Test fun nothingMonitoredByDefaultThenVhf1TowerMatches() {
        val a = st(ped())
        assertNull(a.monitored); assertFalse(a.vhf1Selected)
        assertEquals("RECEIVE STANDBY · SELECT VHF ON AUDIO PANEL", R.liveStatus(a))
        val b = st(ped("L:rx:1", "L:vol:VHF-1"))
        assertEquals("VHF-1", b.monitored?.radio); assertEquals("Training Tower", b.matching?.label)
        assertEquals("RECEIVE · TRAINING TOWER · 121.950 MHz · READY", R.liveStatus(b))
        val off = st(ped("L:rx:1", "L:vol:VHF-1", l = 118000))
        assertEquals("RECEIVE · 118.000 MHz · NO SCRIPTED STATION", R.liveStatus(off))
        assertEquals("Training Approach", st(ped("R:rx:2", "R:vol:VHF-2")).matching?.label)
        // side L channel on the wrong side does not match
        assertNull(st(ped("R:rx:2", "R:vol:VHF-2", r = 121950)).matching)
    }

    @Test fun powerGatesStatusAndPlay() {
        val p = ped("L:rx:1", "L:vol:VHF-1")
        assertEquals("INHIBITED · SIMULATED DC POWER OFF", R.liveStatus(st(p, dc = false)))
        assertEquals(R.Play.Refused("TURN SOUND ON ABOVE FIRST"), R.play(st(p), false))
        assertEquals(R.Play.Refused("INHIBITED · SIMULATED DC POWER OFF"), R.play(st(p, dc = false), true))
        assertEquals(R.Play.Refused("NO AUDIO · SELECT VHF-1 OR VHF-2 ON THE AUDIO SELECTOR"), R.play(st(ped()), true))
        assertEquals(R.Play.Refused("NO SCRIPTED TRAINING STATION ON 118.000 MHz"), R.play(st(ped("L:rx:1", "L:vol:VHF-1", l = 118000)), true))
        val ok = R.play(st(p), true) as R.Play.Speak
        assertTrue(ok.channel.message.startsWith("Oersted Training One, runway zero niner"))
        assertEquals("RECEIVING · TRAINING TOWER · 121.950 MHz", R.startedStatus(ok.channel))
    }

    @Test fun receiverPoweredNeedsSoundDcCbAndMonitorOrCommTest() {
        val p = ped("L:rx:1", "L:vol:VHF-1")
        assertTrue(R.receiverPowered(st(p), mip, true)); assertFalse(R.receiverPowered(st(p), mip, false)); assertFalse(R.receiverPowered(st(p, dc = false), mip, true))
        assertFalse(R.receiverPowered(st(ped()), mip, true))
        assertTrue(R.receiverPowered(st(ped(test = true)), mip, true))
        val open = mip.copy(srcPower = mip.srcPower.copy(comm1Cb = false))
        assertFalse(R.receiverPowered(R.state(p, open, initialSimState(), d(true)), open, true))
    }

    @Test fun transmitNeedsTxRadioPttPowerAndMaskMicInterlock() {
        val p = ped("L:tx:VHF-2", ptt = true)
        assertEquals("VHF-2", st(p).txSelected); assertTrue(st(p).transmitting)
        assertEquals("TRANSMIT · VHF-2 · PTT HELD · SIMULATED ONLY (NO RF)", R.liveStatus(st(p)))
        assertEquals(R.Play.Refused("RELEASE PTT TO RECEIVE"), R.play(st(p.copy(mic = p.mic + ("L:rx:1" to true) + ("L:vol:VHF-1" to true))), true))
        assertTrue(Pedestal.PedestalState().mic["L:rx:1"] == true)   // defaults: every audio selector on, so VHF-1 is monitored out of the box
        assertEquals("PTT HELD · NO TX RADIO SELECTED ON AUDIO PANEL", R.liveStatus(st(ped(ptt = true))))
        val s = initialSimState().apply { crewMaskMic = true; crewOxyMode = "NORMAL"; crewOxyPsi = 1850.0 }
        val masked = st(p, s = s)
        assertTrue(masked.maskMicInterlock); assertFalse(masked.transmitting)
        assertEquals("MASK MICROPHONE INHIBITED · CREW OXYGEN NOT AVAILABLE", R.liveStatus(masked))
        s.crewOxyMode = "ON"; assertTrue(st(p, s = s).transmitting)
        val noCb = mip.copy(srcPower = mip.srcPower.copy(comm2Cb = false))
        assertNull(R.state(p, noCb, initialSimState(), d(true)).txSelected)
        assertEquals("COMM TEST · SQUELCH OPEN · RECEIVER HISS", R.liveStatus(st(ped(test = true))))
    }
}
