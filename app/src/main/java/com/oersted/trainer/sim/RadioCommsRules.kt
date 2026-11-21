package com.oersted.trainer.sim

import java.util.Locale

/**
 * Port of the logic in RadioCommsTrainer.tsx (ATA 23 VHF COM, receive + simulated PTT). Software-only: it never transmits RF or connects to
 * real avionics. [state] derives the monitored radio, the scripted training station, the TX selection and the live status line from the pedestal
 * audio-panel state, the COMM circuit breakers, DC power and the crew mask-mic interlock; the Android layer plays the hiss and the voice.
 */
object RadioCommsRules {
    data class Channel(val side: String, val radio: String, val frequencyKHz: Int, val label: String, val message: String)

    val TRAINING_CHANNELS: List<Channel> = listOf(
        Channel("L", "VHF-1", 121950, "Training Tower", "Oersted Training One, runway zero niner, cleared for the simulated approach. Maintain present heading and report established."),
        Channel("L", "VHF-1", 121800, "Training Ground", "Oersted Training One, taxi via the training apron. Hold short of runway zero niner. This is a simulated ground transmission."),
        Channel("R", "VHF-2", 119100, "Training Approach", "Oersted Training One, training approach. Descend to three thousand feet in the simulation and expect the ILS runway zero niner."),
    )

    const val READY_STATUS = "READY · SYNTHETIC TRAINING AUDIO"
    const val DEFAULT_VOLUME = 0.16f

    /** TS formatMHz: kHz -> "121.950 MHz". */
    fun formatMHz(kHz: Int): String = String.format(Locale.ROOT, "%.3f MHz", kHz / 1000.0)

    data class Monitor(val side: String, val radio: String, val frequencyKHz: Int)

    data class State(
        val dcPower: Boolean,
        val commTest: Boolean,
        val ptt: Boolean,
        val vhf1Selected: Boolean,
        val vhf2Selected: Boolean,
        val freq1KHz: Int,
        val freq2KHz: Int,
        val monitored: Monitor?,
        val matching: Channel?,
        val txSelected: String?,
        val maskMicInterlock: Boolean,
        val transmitting: Boolean,
    )

    /** [audioEnabled] is the page SOUND switch; it only matters for [receiverPowered]. */
    fun state(p: Pedestal.PedestalState, mip: MipLocal.MipState, s: SimState, d: Derived): State {
        val mic = p.mic
        fun m(k: String) = mic[k] == true
        val l = Monitor("L", "VHF-1", p.commL.act)
        val r = Monitor("R", "VHF-2", p.commR.act)
        val lOn = m("L:rx:1") && m("L:vol:VHF-1")
        val rOn = m("R:rx:2") && m("R:vol:VHF-2")
        val monitored = if (lOn) l else if (rOn) r else null
        val matching = monitored?.let { mo -> TRAINING_CHANNELS.firstOrNull { it.side == mo.side && it.frequencyKHz == mo.frequencyKHz } }
        val c1 = mip.srcPower.comm1Cb
        val c2 = mip.srcPower.comm2Cb
        val tx = when {
            m("L:tx:VHF-1") && c1 -> "VHF-1"
            m("L:tx:VHF-2") && c2 -> "VHF-2"
            m("R:tx:VHF-1") && c1 -> "VHF-1"
            m("R:tx:VHF-2") && c2 -> "VHF-2"
            else -> null
        }
        val maskMicInterlock = s.crewMaskMic && (s.crewOxyMode != "ON" || s.crewOxyPsi <= 0 || s.faults.oxygenSystemFailure)
        val transmitting = d.dcPower && p.ptt && tx != null && !maskMicInterlock
        return State(d.dcPower, p.commTest, p.ptt, lOn, rOn, p.commL.act, p.commR.act, monitored, matching, tx, maskMicInterlock, transmitting)
    }

    private fun monPowered(st: State, mip: MipLocal.MipState): Boolean {
        val mo = st.monitored ?: return false
        return st.dcPower && (if (mo.radio == "VHF-1") mip.srcPower.comm1Cb else mip.srcPower.comm2Cb)
    }

    /** Receive: DC + CB + audio enabled + monitor. COMM TEST opens squelch when any COMM CB is closed. */
    fun receiverPowered(st: State, mip: MipLocal.MipState, audioEnabled: Boolean): Boolean =
        audioEnabled && (monPowered(st, mip) || (st.commTest && st.dcPower && (mip.srcPower.comm1Cb || mip.srcPower.comm2Cb)))

    /** Gain of the hiss: COMM TEST (open squelch) is louder, TX mutes the receive audio and plays a soft sidetone. */
    fun hissGain(st: State, volume: Float): Float = if (st.transmitting) minOf(0.12f, volume * 0.7f) else if (st.commTest) volume * 2.2f else volume

    /** TS live-status effect: the line shown under the buttons while nothing else has been pressed. */
    fun liveStatus(st: State): String = when {
        !st.dcPower -> "INHIBITED · SIMULATED DC POWER OFF"
        st.maskMicInterlock && st.ptt -> "MASK MICROPHONE INHIBITED · CREW OXYGEN NOT AVAILABLE"
        st.transmitting -> "TRANSMIT · ${st.txSelected} · PTT HELD · SIMULATED ONLY (NO RF)"
        st.ptt && st.txSelected == null -> "PTT HELD · NO TX RADIO SELECTED ON AUDIO PANEL"
        st.commTest -> "COMM TEST · SQUELCH OPEN · RECEIVER HISS"
        st.monitored == null -> "RECEIVE STANDBY · SELECT VHF ON AUDIO PANEL"
        st.matching != null -> "RECEIVE · ${st.matching.label.uppercase()} · ${formatMHz(st.matching.frequencyKHz)} · READY"
        else -> "RECEIVE · ${formatMHz(st.monitored.frequencyKHz)} · NO SCRIPTED STATION"
    }

    /** Result of pressing "Play simulated ATC message": a refusal status, or the message to speak. */
    sealed class Play {
        data class Refused(val status: String) : Play()
        data class Speak(val channel: Channel) : Play()
    }

    fun play(st: State, audioEnabled: Boolean): Play = when {
        !audioEnabled -> Play.Refused("TURN SOUND ON ABOVE FIRST")
        !st.dcPower -> Play.Refused("INHIBITED · SIMULATED DC POWER OFF")
        st.transmitting -> Play.Refused("RELEASE PTT TO RECEIVE")
        st.monitored == null -> Play.Refused("NO AUDIO · SELECT VHF-1 OR VHF-2 ON THE AUDIO SELECTOR")
        st.matching == null -> Play.Refused("NO SCRIPTED TRAINING STATION ON ${formatMHz(st.monitored.frequencyKHz)}")
        else -> Play.Speak(st.matching)
    }

    /** utterance.volume = clamp(volume * 3, 0.1, 1). */
    fun speechVolume(volume: Float): Float = maxOf(0.1f, minOf(1f, volume * 3))

    fun startedStatus(c: Channel) = "RECEIVING · ${c.label.uppercase()} · ${formatMHz(c.frequencyKHz)}"
    const val DONE_STATUS = "MESSAGE COMPLETE · RECEIVE STANDBY"
    const val ERROR_STATUS = "VOICE PLAYBACK FAILED · TRY AGAIN"
    const val UNAVAILABLE_STATUS = "SPEECH SYNTHESIS NOT AVAILABLE ON THIS DEVICE"
}
