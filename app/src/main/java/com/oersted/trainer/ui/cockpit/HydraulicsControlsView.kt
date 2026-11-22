package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.HydraulicTrainerRules as R
import com.oersted.trainer.sim.SimState

/**
 * Port of HydraulicTrainerSwitch + the "P5 / Trainer controls" box that closes HydraulicsTrainerPanel (routes/cockpit.tsx):
 * ENG / ELEC pump switches, STANDBY selector, ground interconnect / servicing / GPMU / air-cart switches and the A · B · S
 * pressure chips. The phone layout uses the web's two-column breakpoint (grid-cols-2). Compose only; rules in [R].
 */
internal enum class SwTone { A, B, S, ACCENT }

internal fun SwTone.color(): Color = when (this) { SwTone.A -> FlowHydA; SwTone.B -> FlowHydB; SwTone.S -> FlowHydS; SwTone.ACCENT -> FlowAccent }

@Composable
internal fun HydTrainerSwitch(label: String, state: String, tone: SwTone, detail: String?, enabled: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val live = R.switchLive(state)
    val shape = RoundedCornerShape(4.dp)
    Column(
        modifier.alpha(if (enabled) 1f else 0.45f)
            .background(if (live) Color.White.copy(alpha = 0.05f) else FlowInset, shape)
            .border(1.dp, tone.color().copy(alpha = 0.5f), shape)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(6.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = FlowFg, fontSize = 8.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.1.em, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            Box(Modifier.padding(start = 4.dp).width(14.dp).height(20.dp).background(Color(0xFF090B0E), CircleShape).border(1.dp, if (live) FlowOk.copy(alpha = 0.6f) else FlowBorder, CircleShape)) {
                Box(
                    Modifier.align(if (live) Alignment.TopStart else Alignment.BottomStart)
                        .offset(x = 2.dp, y = if (live) 2.dp else (-2).dp)
                        .size(8.dp)
                        .background(if (live) FlowOk else Color(0xFF3B4148), CircleShape)
                        .border(1.dp, if (live) FlowOk else Color(0xFF555C64), CircleShape),
                )
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 2.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(state, color = if (live) FlowOk else FlowSubtle, fontFamily = FontFamily.Monospace, fontSize = 7.sp)
            if (detail != null) Text(detail, color = FlowSubtle, fontFamily = FontFamily.Monospace, fontSize = 7.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 4.dp))
        }
    }
}

@Composable
private fun StandbySelector(s: SimState, modifier: Modifier, change: ((SimState) -> SimState) -> Unit) {
    val shape = RoundedCornerShape(8.dp)
    Column(modifier.background(FlowInset, shape).border(1.dp, FlowHydS.copy(alpha = 0.5f), shape).padding(6.dp)) {
        Text("STANDBY", color = FlowFg, fontSize = 7.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.12.em, modifier = Modifier.padding(bottom = 4.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (mode in R.STBY_MODES) {
                val sel = s.stbyHyd == mode
                val bs = RoundedCornerShape(4.dp)
                Box(
                    Modifier.weight(1f)
                        .background(if (sel) FlowHydS.copy(alpha = 0.1f) else Color(0xFF14181E), bs)
                        .border(1.dp, if (sel) FlowHydS.copy(alpha = 0.6f) else FlowBorder, bs)
                        .clickable { change { R.setStbyHyd(it, mode) } }
                        .padding(vertical = 4.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(mode, color = if (sel) FlowHydS else FlowSubtle, fontSize = 7.sp) }
            }
        }
    }
}

@Composable
private fun PressureChip(text: String, live: Boolean, tone: SwTone, modifier: Modifier) {
    val shape = RoundedCornerShape(8.dp)
    val c = tone.color()
    Box(
        modifier.background(if (live) c.copy(alpha = 0.05f) else Color.Transparent, shape).border(1.dp, if (live) c.copy(alpha = 0.5f) else FlowBorder, shape).padding(6.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = if (live) c else FlowSubtle, fontFamily = FontFamily.Monospace, fontSize = 11.sp, textAlign = TextAlign.Center) }
}

@Composable
internal fun HydraulicsTrainerControls(s: SimState, d: Derived, change: ((SimState) -> SimState) -> Unit) {
    val aLive = s.hydAPress > 1500
    val bLive = s.hydBPress > 1500
    val stbyLive = s.hydSPress > 1800
    val interconnectActual = R.interconnectActual(s)
    val onGround = R.groundServicingEnabled(s)
    val shape = RoundedCornerShape(8.dp)
    Column(Modifier.fillMaxWidth().background(Color(0xFF0D1013), shape).border(1.dp, FlowBorder, shape).padding(10.dp)) {
        Text("P5 / TRAINER CONTROLS", color = FlowSubtle, fontSize = 9.sp, letterSpacing = 0.16.em, modifier = Modifier.padding(bottom = 6.dp))
        val cells: List<@Composable (Modifier) -> Unit> = listOf(
            { m -> HydTrainerSwitch("ENG 1 PUMP", if (s.engHyd1) "ON" else "OFF", SwTone.A, "SYSTEM A", true, m) { change { R.toggle(it, "engHyd1") } } },
            { m -> HydTrainerSwitch("ENG 2 PUMP", if (s.engHyd2) "ON" else "OFF", SwTone.A, "SYSTEM A", true, m) { change { R.toggle(it, "engHyd2") } } },
            { m -> HydTrainerSwitch("ELEC 1 PUMP", if (s.elecHyd1) "ON" else "OFF", SwTone.B, R.elecPumpDetail(d.transferBus1Powered, d.hydBPump1On, 1), R.elecPumpEnabled(d, 1), m) { change { R.toggle(it, "elecHyd1") } } },
            { m -> HydTrainerSwitch("ELEC 2 PUMP", if (s.elecHyd2) "ON" else "OFF", SwTone.B, R.elecPumpDetail(d.transferBus2Powered, d.hydBPump2On, 2), R.elecPumpEnabled(d, 2), m) { change { R.toggle(it, "elecHyd2") } } },
            { m -> StandbySelector(s, m, change) },
            { m -> HydTrainerSwitch("GND INTERCONNECT", R.interconnectState(s.groundInterconnect), SwTone.ACCENT, R.interconnectDetail(interconnectActual), true, m) { change { R.toggle(it, "groundInterconnect") } } },
            { m -> HydTrainerSwitch("GND SERVICING", R.connectedState(s.hydServicingConnected), SwTone.ACCENT, R.servicingDetail(s.wow), onGround, m) { change { R.toggle(it, "hydServicingConnected") } } },
            { m -> HydTrainerSwitch("GND HYD POWER", R.connectedState(s.hydGroundPowerConnected), SwTone.ACCENT, R.gpmuDetail(s.wow), onGround, m) { change { R.toggle(it, "hydGroundPowerConnected") } } },
            { m -> HydTrainerSwitch("GND AIR CART", R.connectedState(s.groundPneumaticConnected), SwTone.ACCENT, R.airCartDetail(s.wow), onGround, m) { change { R.toggleGroundAirCart(it) } } },
        )
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            cells.chunked(2).forEach { pair ->
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    pair.forEach { c -> c(Modifier.weight(1f).fillMaxHeight()) }
                    if (pair.size == 1) Box(Modifier.weight(1f))
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PressureChip(R.pressureText("A", s.hydAPress), aLive, SwTone.A, Modifier.weight(1f))
            PressureChip(R.pressureText("B", s.hydBPress), bLive, SwTone.B, Modifier.weight(1f))
            PressureChip(R.pressureText("S", s.hydSPress), stbyLive, SwTone.S, Modifier.weight(1f))
        }
    }
}
