package com.oersted.trainer.ui.cockpit

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.RadioCommsRules as R
import com.oersted.trainer.ui.common.Classic737Palette
import java.util.Locale
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/**
 * Port of RadioCommsTrainer.tsx (ATA 23 VHF COM, receive + simulated PTT). Software-only: simulated voice and static, no RF, not connected to ATC.
 * Logic: [R]. Receiver hiss = looping band-passed noise on an AudioTrack ([ComHiss], web: noise buffer -> 1500 Hz band-pass); the simulated ATC message
 * is spoken by the platform TextToSpeech (web: speechSynthesis, rate 0.88, pitch 0.82). Compose / Android only; verified on CI.
 */
private class ComHiss {
    private var track: AudioTrack? = null

    /** 2 s of noise * 0.22 through a 1500 Hz band-pass (Q 0.65), looped. */
    private fun buffer(sr: Int): ShortArray {
        val n = sr * 2
        val w0 = 2 * PI * 1500 / sr; val alpha = sin(w0) / (2 * 0.65)
        val b0 = alpha; val b2 = -alpha; val a0 = 1 + alpha; val a1 = -2 * cos(w0); val a2 = 1 - alpha
        var x1 = 0.0; var x2 = 0.0; var y1 = 0.0; var y2 = 0.0
        val out = ShortArray(n)
        val rnd = Random(7)
        for (i in 0 until n) {
            val x = (rnd.nextDouble() * 2 - 1) * 0.22
            val y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0
            x2 = x1; x1 = x; y2 = y1; y1 = y
            out[i] = (y.coerceIn(-1.0, 1.0) * 32767 * 2.5).toInt().coerceIn(-32768, 32767).toShort()
        }
        return out
    }

    fun set(on: Boolean, gain: Float) {
        if (!on) { stop(); return }
        val t = track ?: run {
            val sr = 22050
            val data = buffer(sr)
            val nt = AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(sr).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(data.size * 2).setTransferMode(AudioTrack.MODE_STATIC).build()
            nt.write(data, 0, data.size); nt.setLoopPoints(0, data.size, -1)
            track = nt; nt
        }
        t.setVolume(gain.coerceIn(0f, 1f))
        if (t.playState != AudioTrack.PLAYSTATE_PLAYING) t.play()
    }

    fun stop() { try { track?.stop() } catch (_: IllegalStateException) {} }
    fun release() { stop(); track?.release(); track = null }
}

private class ComVoice(ctx: Context, private val onStatus: (String) -> Unit) {
    private var ready = false
    private var failed = false
    private val tts: TextToSpeech = TextToSpeech(ctx) { code ->
        if (code == TextToSpeech.SUCCESS) { ready = true } else failed = true
    }

    fun speak(c: R.Channel, volume: Float) {
        if (failed || !ready) { onStatus(R.UNAVAILABLE_STATUS); return }
        tts.stop()
        tts.setSpeechRate(0.88f); tts.setPitch(0.82f)
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = onStatus(R.startedStatus(c))
            override fun onDone(utteranceId: String?) = onStatus(R.DONE_STATUS)
            @Deprecated("Deprecated in Java") override fun onError(utteranceId: String?) = onStatus(R.ERROR_STATUS)
        })
        val params = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, R.speechVolume(volume)) }
        tts.speak(c.message, TextToSpeech.QUEUE_FLUSH, params, "com")
    }

    fun shutdown() { tts.stop(); tts.shutdown() }
}

@Composable
private fun Cell(text: String, sub: String? = null, color: Color = Classic737Palette.Fg, border: Color = Classic737Palette.Border, modifier: Modifier = Modifier, inset: Boolean = true) {
    Column(modifier.background(if (inset) Classic737Palette.Inset else Color.Transparent, RoundedCornerShape(4.dp)).border(1.dp, border, RoundedCornerShape(4.dp)).padding(8.dp)) {
        Text(text, color = color, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
        if (sub != null) Text(sub, color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
fun RadioCommsTrainer(cockpit: CockpitModel, audioEnabled: Boolean, modifier: Modifier = Modifier) {
    val p by cockpit.pedestalState.collectAsState()
    val mip by cockpit.mipState.collectAsState()
    val s by cockpit.simState.collectAsState()
    val d by cockpit.derived.collectAsState()
    val ctx = LocalContext.current
    var status by remember { mutableStateOf(R.READY_STATUS) }
    var volume by remember { mutableFloatStateOf(R.DEFAULT_VOLUME) }
    val st = R.state(p, mip, s, d)
    val rxOn = R.receiverPowered(st, mip, audioEnabled)

    val hiss = remember { ComHiss() }
    DisposableEffect(Unit) { onDispose { hiss.release() } }
    LaunchedEffect(rxOn, volume, st.commTest, st.transmitting) { hiss.set(rxOn, R.hissGain(st, volume)) }
    val voice = remember { ComVoice(ctx) { status = it } }
    DisposableEffect(Unit) { onDispose { voice.shutdown() } }
    // live status for PTT / COMM TEST (web effect on dcPower, transmitting, maskMicInterlock, txSelected, ptt, commTest, monitored, matching)
    LaunchedEffect(st.dcPower, st.transmitting, st.maskMicInterlock, st.txSelected, st.ptt, st.commTest, st.monitored, st.matching) { status = R.liveStatus(st) }

    val border = Classic737Palette.Border
    Column(modifier.fillMaxWidth().padding(top = 8.dp).background(Classic737Palette.Panel, RoundedCornerShape(4.dp)).border(1.dp, border, RoundedCornerShape(4.dp)).padding(8.dp)) {
        Text("VHF COM · RECEIVE + SIMULATED PTT (ATA 23)", color = Classic737Palette.Subtle, fontSize = 9.sp, letterSpacing = 0.14.em, modifier = Modifier.padding(bottom = 4.dp))
        Text(
            "SIMULATED VOICE AND STATIC ONLY · NO RF TRANSMISSION · NOT CONNECTED TO REAL ATC", color = Color(0xFFFDE68A), fontFamily = FontFamily.Monospace, fontSize = 8.sp, lineHeight = 12.sp,
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp).background(Color(0x33451A03), RoundedCornerShape(4.dp)).border(1.dp, Color(0x66F59E0B), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 6.dp),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Cell("VHF-1 · ${R.formatMHz(st.freq1KHz)}", if (st.vhf1Selected) "AUDIO SELECTED" else "AUDIO NOT SELECTED", modifier = Modifier.weight(1f))
            Cell("VHF-2 · ${R.formatMHz(st.freq2KHz)}", if (st.vhf2Selected) "AUDIO SELECTED" else "AUDIO NOT SELECTED", modifier = Modifier.weight(1f))
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Cell(if (st.dcPower) "DC POWER" else "NO DC", color = if (st.dcPower) Color(0xFF6EE7B7) else Color(0xFFFCA5A5), border = if (st.dcPower) Color(0x6610B981) else Color(0x80EF4444), modifier = Modifier.weight(1f), inset = false)
            Cell(if (st.commTest) "COMM TEST ON" else "COMM TEST OFF", color = if (st.commTest) Color(0xFFFDE68A) else Classic737Palette.Subtle, border = if (st.commTest) Color(0x80F59E0B) else border, modifier = Modifier.weight(1f), inset = false)
            Cell(if (st.transmitting) "TX ${st.txSelected}" else if (st.ptt) "PTT · NO RADIO" else "RX", color = if (st.transmitting) Color(0xFFFEF3C7) else Classic737Palette.Subtle, border = if (st.transmitting) Color(0xFFFBBF24) else border, modifier = Modifier.weight(1f), inset = false)
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("RADIO AUDIO LEVEL", color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
            Slider(value = volume, onValueChange = { volume = it }, valueRange = 0.02f..0.5f, modifier = Modifier.weight(1f))
        }
        Text(
            "PLAY SIMULATED ATC MESSAGE", color = Classic737Palette.Fg, fontFamily = FontFamily.Monospace, fontSize = 9.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp).background(Classic737Palette.Accent.copy(alpha = 0.1f), RoundedCornerShape(4.dp)).border(1.dp, Classic737Palette.Accent.copy(alpha = 0.5f), RoundedCornerShape(4.dp))
                .clickable {
                    when (val r = R.play(st, audioEnabled)) {
                        is R.Play.Refused -> status = r.status
                        is R.Play.Speak -> voice.speak(r.channel, volume)
                    }
                }.padding(8.dp),
        )
        Text(
            status.uppercase(Locale.ROOT), color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp, lineHeight = 12.sp,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp).background(Classic737Palette.Inset, RoundedCornerShape(4.dp)).border(1.dp, border, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 6.dp),
        )
        Text(
            "Receive: DC power + audio selector VHF + volume. COMM TEST (pedestal VHF head) opens squelch (hiss). " +
                "Transmit: select TX radio on audio panel, hold PTT — simulated only, no RF. If MASK MIC is selected, crew oxygen must be ON and available. Release PTT to return to receive.",
            color = Classic737Palette.Subtle, fontSize = 8.sp, lineHeight = 12.sp, modifier = Modifier.padding(top = 4.dp),
        )
    }
}
