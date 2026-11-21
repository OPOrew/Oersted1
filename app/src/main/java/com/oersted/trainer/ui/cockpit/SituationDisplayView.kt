package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.AutoFlight.GsPhase
import com.oersted.trainer.sim.AutoFlight.LatSub
import com.oersted.trainer.sim.RadioNav
import com.oersted.trainer.sim.RunwaySceneRules
import com.oersted.trainer.sim.Situation
import com.oersted.trainer.ui.common.Classic737Palette
import kotlinx.coroutines.delay
import java.util.Locale

/**
 * Port of SituationDisplay.tsx: "What is happening" view for the Navigation and Autopilot training tabs: the runway scene plus a plain-language
 * explanation of the autopilot's current mode and why ([Situation.explain]). It only reads the live simulation; it adds no new simulation.
 */
private fun toneColors(t: Situation.Tone): Triple<Color, Color, Color> = when (t) { // border, background, text
    Situation.Tone.INFO -> Triple(Classic737Palette.Border, Color.Transparent, Classic737Palette.Fg)
    Situation.Tone.ARMED -> Triple(Color(0x80F59E0B), Color(0x33451A03), Color(0xFFFDE68A))
    Situation.Tone.OK -> Triple(Color(0x6610B981), Color(0x33022C22), Color(0xFFA7F3D0))
    Situation.Tone.WARN -> Triple(Color(0x80EF4444), Color(0x33450A0A), Color(0xFFFECACA))
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SituationDisplay(cockpit: CockpitModel, focus: String, modifier: Modifier = Modifier) {
    val m by cockpit.mipState.collectAsState()
    val navState by cockpit.navState.collectAsState()
    var sit by remember { mutableStateOf(cockpit.situationSample()) }
    LaunchedEffect(cockpit) { while (true) { sit = cockpit.situationSample(); delay(100) } }

    val navValid = m.navOn && (if (m.navTuned == "ILS") m.nav.locValid else m.nav.vorValid)
    val vorDev = RadioNav.vorDevOf(m.nav.radial, m.selCrs).dev
    val box = modifier.fillMaxWidth().padding(top = 8.dp).background(Classic737Palette.Panel, RoundedCornerShape(4.dp))
        .border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp)).padding(8.dp)
    val head = @Composable { text: String -> Text(text.uppercase(), color = Classic737Palette.Subtle, fontSize = 9.sp, letterSpacing = 0.14.em) }

    if (m.navScene != RadioNav.NavSceneId.RPLL06) {
        val pos = navState?.let { String.format(Locale.ROOT, "%.4f°, %.4f°", it.latitude, it.longitude) } ?: "waiting for telemetry"
        val hdg = navState?.let { String.format(Locale.ROOT, "%.0f", it.headingDeg) } ?: "---"
        val alt = navState?.let { String.format(Locale.ROOT, "%.0f", it.altitudeFt) } ?: "---"
        val gs = RunwaySceneRules.jsRound(navState?.groundSpeedKt ?: 0.0)
        Column(box) {
            head("What is happening")
            Text("Aircraft position is synchronized with the navigation map.", color = Classic737Palette.Fg, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
            Text(
                "POS $pos · HDG $hdg° · ALT $alt ft · GS $gs kt · PLAN NAV: ${m.planNavStatus}",
                color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 10.sp, modifier = Modifier.padding(top = 4.dp),
            )
            RunwayScene(cockpit)
        }
        return
    }

    val text = Situation.explain(
        Situation.ExplainIn(
            sit = sit, navOn = m.navOn, tuned = m.navTuned, nav = m.nav, navValid = navValid, selCrs = m.selCrs, selHdg = m.selHdg, apNav = m.apNav,
            apHdgSw = m.apHdgSw, apAil = m.apAil, apElev = m.apElev, apPitch = m.apPitch, apWhy = m.apWhy, vorDev = vorDev,
        ),
    )
    Column(box) {
        FlowRow(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            head("What is happening · " + if (focus == "nav") "where you are relative to the beam" else "what the autopilot is doing")
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                val chip = @Composable { t: String ->
                    Text(t.uppercase(), color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
                }
                chip("LAT " + if (sit.latSub == LatSub.OFF) "—" else sit.latSub.name.replace("_", " "))
                chip("VERT " + if (sit.gsPhase == GsPhase.OFF) "—" else "G/S ${sit.gsPhase.name}")
            }
        }
        RunwayScene(cockpit)
        Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (l in text.lateral + text.vertical) {
                val (bd, bg, fg) = toneColors(l.tone)
                Text(l.text, color = fg, fontSize = 10.sp, lineHeight = 13.sp, modifier = Modifier.fillMaxWidth().background(bg, RoundedCornerShape(4.dp)).border(1.dp, bd, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 6.dp))
            }
        }
        Text(
            "This view reads the live simulation, so every control on the panel moves it. Amber = armed or intercepting, green = captured, cyan = pilot flying. Simplified training geometry, not for navigation.",
            color = Classic737Palette.Subtle, fontSize = 8.sp, lineHeight = 10.sp, modifier = Modifier.padding(top = 4.dp),
        )
    }
}
