package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.FlowWires
import com.oersted.trainer.sim.FlowWires.Tone
import com.oersted.trainer.sim.SimState
import kotlin.math.floor

/**
 * Port of HydraulicsTrainerPanel's drawing (routes/cockpit.tsx): air-pressurization box, system A / B / standby circuits, ground
 * servicing, ground-power interconnect and the A / B / S pressure strip. The wire router is [FlowWires.hydraulic]; node rectangles
 * are measured with [FlowGeo]. The web's P5 / trainer control grid is [HydraulicsTrainerControls] (HydraulicsControlsView.kt), placed under this drawing. Compose only.
 */

private val A_USERS = listOf("GROUND SPOILERS", "INBOARD FLIGHT SPOILERS", "AILERONS", "LE FLAPS / SLATS", "TE FLAPS", "LANDING GEAR / NOSE STEERING", "ELEVATORS", "RUDDER", "INBOARD BRAKES", "THRUST REVERSER")
private val B_USERS = listOf("AILERONS", "ELEVATORS", "RUDDER", "OUTBOARD FLIGHT SPOILERS", "OUTBOARD BRAKES")
private val S_USERS = listOf("STANDBY RUDDER", "LE FLAPS / SLATS")

private fun psi(v: Double) = "${floor(v + 0.5).toLong()} PSI"
private fun pct(v: Double) = floor(v + 0.5).toLong()

@Composable
private fun FlowBox(border: Color, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth().background(Color(0xFF0D1013), RoundedCornerShape(8.dp)).border(1.dp, border, RoundedCornerShape(8.dp)).padding(10.dp)) { content() }
}

@Composable
private fun SectionHeader(title: String, sub: String?, tone: Tone) {
    val c = tone.color()
    Column(Modifier.fillMaxWidth().background(c.copy(alpha = 0.05f), RoundedCornerShape(6.dp)).border(1.dp, c.copy(alpha = 0.4f), RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, color = c, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.12.em)
        if (sub != null) Text(sub, color = FlowSubtle, fontSize = 5.sp, letterSpacing = 0.08.em)
    }
}

/** Two equal cells (web `grid grid-cols-2 gap-x-3`); heights stretch to the taller cell. */
@Composable
private fun Cols2(gap: Dp = 12.dp, left: @Composable (Modifier) -> Unit, right: @Composable (Modifier) -> Unit) {
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(gap)) {
        left(Modifier.weight(1f).fillMaxHeight())
        right(Modifier.weight(1f).fillMaxHeight())
    }
}

@Composable
private fun UserGrid(geo: FlowGeo, k: String, users: List<String>, live: Boolean, tone: Tone) {
    Column(Modifier.fillMaxWidth().flowId(geo, "$k-users"), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        users.chunked(2).forEachIndexed { row, pair ->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                pair.forEachIndexed { j, u -> FlowUserChip(geo, "$k-u${row * 2 + j}", u, live, tone, Modifier.weight(1f).fillMaxHeight()) }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
internal fun HydraulicsFlowDiagram(s: SimState, d: Derived) {
    val aLive = s.hydAPress > 1500
    val bLive = s.hydBPress > 1500
    val stbyLive = s.hydSPress > 1800
    val bleed1On = d.bleed1Available
    val bleed2On = d.bleed2Available
    val resAir = d.reservoirPressurized
    val groundAirLive = d.reservoirGroundAir
    val groundServiceLive = s.hydServicingConnected && s.wow
    val groundPowerHydLive = s.hydGroundPowerConnected && s.wow
    val interconnectActual = s.groundInterconnect && s.hydGroundPowerConnected && s.wow && s.parkingBrake
    val flags = FlowWires.HydFlags(
        aLive, bLive, stbyLive, bleed1On, bleed2On, resAir, groundAirLive, groundServiceLive, groundPowerHydLive, interconnectActual,
        d.hydAPump1On, d.hydAPump2On, d.hydBPump1On, d.hydBPump2On, d.stbyOn, s.parkingBrake,
    )
    val head = if (resAir) "40–47" else "0"

    FlowRoot(Modifier.fillMaxWidth(), wires = { FlowWires.hydraulic(it, flags) }) { geo ->
        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            // ── RESERVOIR PRESSURIZATION — AIR ──
            FlowBox(FlowAccent.copy(alpha = 0.35f)) {
                Column(Modifier.fillMaxWidth().background(FlowAccent.copy(alpha = 0.05f), RoundedCornerShape(6.dp)).border(1.dp, FlowAccent.copy(alpha = 0.4f), RoundedCornerShape(6.dp)).padding(horizontal = 8.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("RESERVOIR PRESSURIZATION · AIR", color = FlowAccent, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.16.em)
                }
                Spacer(Modifier.height(12.dp))
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    val w = (maxWidth - 48.dp) / 4          // four columns, 16 dp gaps
                    Column {
                        Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            FlowNode(geo, "air-b1", "engine", "ENG 1 BLEED", bleed1On, Tone.GROUND, if (bleed1On) "AVAILABLE" else "OFF", modifier = Modifier.width(w).fillMaxHeight())
                            FlowNode(geo, "air-b2", "engine", "ENG 2 BLEED", bleed2On, Tone.GROUND, if (bleed2On) "AVAILABLE" else "OFF", modifier = Modifier.width(w).fillMaxHeight())
                            FlowNode(geo, "air-filter", "filter", "AIR FILTER", resAir, Tone.GROUND, "BLEED-AIR FILTER", modifier = Modifier.width(w).fillMaxHeight())
                            FlowNode(geo, "air-reg", "gauge", "PRESSURE REGULATOR", resAir, Tone.GROUND, "40–47 PSI", modifier = Modifier.width(w).fillMaxHeight())
                        }
                        Spacer(Modifier.height(36.dp))
                        Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            FlowNode(geo, "air-relief", "valve", "PRESSURIZATION RELIEF VALVE", resAir, Tone.GROUND, "MANIFOLD OVERPRESSURE PROTECTION", modifier = Modifier.width(w).fillMaxHeight())
                            FlowNode(geo, "air-man", "manifold", "AIR MANIFOLD", resAir, Tone.GROUND, "COMMON FEED → A · B · STANDBY RESERVOIRS", modifier = Modifier.width(w * 2 + 16.dp).fillMaxHeight())
                            FlowNode(geo, "air-cart", "cart", "GROUND AIR CART", groundAirLive, Tone.GROUND, "ALTERNATE GROUND SOURCE · WHEN NO N₂ ON GROUND", liveText = "CONNECTED", modifier = Modifier.width(w).fillMaxHeight())
                        }
                        Spacer(Modifier.height(32.dp))
                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            FlowNode(geo, "air-bal", "connection", "BALANCE CONNECTION", resAir, Tone.STANDBY, "RESERVOIR PRESSURIZATION PORT", compact = true, modifier = Modifier.fillMaxWidth(0.5f))
                        }
                    }
                }
            }

            // ── SYSTEM A AND B ──
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(56.dp)) {
                Column(Modifier.weight(1f).flowId(geo, "a-sec").background(Color(0xFF0B1015), RoundedCornerShape(8.dp)).border(1.dp, FlowHydA.copy(alpha = 0.35f), RoundedCornerShape(8.dp)).padding(start = 30.dp, end = 30.dp, top = 8.dp, bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    SectionHeader("SYSTEM A", "ENGINE-DRIVEN · ${psi(s.hydAPress)}", Tone.A)
                    FlowNode(geo, "a-res", "reservoir", "A RESERVOIR", resAir || aLive, Tone.A, "QTY ${pct(d.hydAQty)}% · HEAD $head PSI", compact = true, modifier = Modifier.fillMaxWidth())
                    Cols2(left = { FlowNode(geo, "a-fs1", "shutoff", "FIRE SHUTOFF · ENG 1", d.hydAPump1On, Tone.A, if (!s.engine1FirePulled) "OPEN · NORMAL" else "CLOSED · FIRE", compact = true, modifier = it) },
                        right = { FlowNode(geo, "a-fs2", "shutoff", "FIRE SHUTOFF · ENG 2", d.hydAPump2On, Tone.A, if (!s.engine2FirePulled) "OPEN · NORMAL" else "CLOSED · FIRE", compact = true, modifier = it) })
                    Cols2(left = { FlowNode(geo, "a-p1", "pump", "ENG 1 PUMP", d.hydAPump1On, Tone.A, if (d.hydAPump1On) "ON" else "OFF", compact = true, modifier = it) },
                        right = { FlowNode(geo, "a-p2", "pump", "ENG 2 PUMP", d.hydAPump2On, Tone.A, if (d.hydAPump2On) "ON" else "OFF", compact = true, modifier = it) })
                    Cols2(left = { FlowNode(geo, "a-pf1", "filter", "A PRESSURE FILTER · ENG 1", d.hydAPump1On, Tone.A, "PUMP OUTLET", compact = true, modifier = it) },
                        right = { FlowNode(geo, "a-pf2", "filter", "A PRESSURE FILTER · ENG 2", d.hydAPump2On, Tone.A, "PUMP OUTLET", compact = true, modifier = it) })
                    FlowNode(geo, "a-mod", "module", "A MODULE / DISTRIBUTION UNIT", aLive, Tone.A, "RELIEF · CHECK · LP SWITCH ${if (aLive) "OK" else "LOW"}", compact = true, modifier = Modifier.fillMaxWidth())
                    UserGrid(geo, "a", A_USERS, aLive, Tone.A)
                    Cols2(left = { FlowReturn(geo, "a-rf", "filter", "A RETURN FILTER", "MAIN RETURN → RESERVOIR", aLive, Tone.A, it) },
                        right = { FlowReturn(geo, "a-hx", "hx", "A CASE-DRAIN HEAT EXCHANGER", "EDP CASE DRAIN · No. 1 FUEL TANK", d.hydAPump1On || d.hydAPump2On, Tone.A, it) })
                }
                Column(Modifier.weight(1f).flowId(geo, "b-sec").background(Color(0xFF0B1015), RoundedCornerShape(8.dp)).border(1.dp, FlowHydB.copy(alpha = 0.35f), RoundedCornerShape(8.dp)).padding(start = 30.dp, end = 30.dp, top = 8.dp, bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    SectionHeader("SYSTEM B", "ELECTRIC PUMPS · ${psi(s.hydBPress)}", Tone.B)
                    FlowNode(geo, "b-res", "reservoir", "B RESERVOIR", resAir || bLive, Tone.B, "QTY ${pct(d.hydBQty)}% · HEAD $head PSI", compact = true, modifier = Modifier.fillMaxWidth())
                    Cols2(left = { FlowNode(geo, "b-p1", "epump", "ELEC 1 PUMP", d.hydBPump1On, Tone.B, (if (d.hydBPump1On) "ON" else "OFF") + (if (d.hydBPump1Low) " · LOW PRESS" else ""), compact = true, modifier = it) },
                        right = { FlowNode(geo, "b-p2", "epump", "ELEC 2 PUMP", d.hydBPump2On, Tone.B, (if (d.hydBPump2On) "ON" else "OFF") + (if (d.hydBPump2Low) " · LOW PRESS" else ""), compact = true, modifier = it) })
                    FlowNode(geo, "b-mod", "module", "B MODULE / DISTRIBUTION UNIT", bLive, Tone.B, "FILTER · RELIEF · PUMP LP SWITCHES ${if (bLive) "OK" else "LOW"}", compact = true, modifier = Modifier.fillMaxWidth())
                    UserGrid(geo, "b", B_USERS, bLive, Tone.B)
                    Cols2(left = { FlowReturn(geo, "b-rf", "filter", "B RETURN FILTER", "MAIN SYSTEM B RETURN", bLive, Tone.B, it) },
                        right = { FlowReturn(geo, "b-hx", "hx", "B RETURN HEAT EXCHANGER", "RIGHT · No. 2 FUEL TANK", bLive, Tone.B, it) })
                }
            }

            // ── STANDBY + GROUND SERVICING ──
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(56.dp)) {
                Column(Modifier.weight(1f).fillMaxHeight().flowId(geo, "s-sec").background(Color(0xFF0B1015), RoundedCornerShape(8.dp)).border(1.dp, FlowHydS.copy(alpha = 0.35f), RoundedCornerShape(8.dp)).padding(start = 30.dp, end = 30.dp, top = 8.dp, bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    SectionHeader("STANDBY SYSTEM", "ELECTRIC MOTOR-DRIVEN · ${psi(s.hydSPress)}", Tone.STANDBY)
                    FlowNode(geo, "s-res", "reservoir", "STANDBY RESERVOIR", resAir || stbyLive || groundServiceLive, Tone.STANDBY, "QTY ${pct(d.hydSQty)}% · HEAD $head PSI", compact = true, modifier = Modifier.fillMaxWidth())
                    FlowNode(geo, "s-pump", "epump", "STANDBY AC MOTOR PUMP", d.stbyOn, Tone.STANDBY, if (d.stbyOn) "ON · ON DEMAND" else "OFF / ON DEMAND", compact = true, modifier = Modifier.fillMaxWidth())
                    FlowNode(geo, "s-mod", "module", "STANDBY HYDRAULIC MODULAR UNIT", stbyLive, Tone.STANDBY, "RELIEF · FILTER · LP SWITCH ${if (stbyLive) "OK" else "LOW"}", compact = true, modifier = Modifier.fillMaxWidth())
                    UserGrid(geo, "s", S_USERS, stbyLive, Tone.STANDBY)
                    FlowReturn(geo, "s-return", "connection", "STANDBY RETURN", "DIRECT TO STANDBY RESERVOIR · NO HX / RETURN FILTER", stbyLive, Tone.STANDBY, Modifier.fillMaxWidth())
                }
                Column(Modifier.weight(1f).fillMaxHeight().flowId(geo, "g-sec").background(Color(0xFF0D1013), RoundedCornerShape(8.dp)).border(1.dp, FlowAccent.copy(alpha = 0.3f), RoundedCornerShape(8.dp)).padding(6.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Column(Modifier.fillMaxWidth().background(FlowAccent.copy(alpha = 0.05f), RoundedCornerShape(8.dp)).border(1.dp, FlowAccent.copy(alpha = 0.5f), RoundedCornerShape(8.dp)).padding(horizontal = 8.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("GROUND HYDRAULIC SERVICING", color = FlowAccent, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.14.em, textAlign = TextAlign.Center)
                    }
                    Cols2(left = { FlowNode(geo, "g-fill", "fill", "CENTRAL FLUID SUPPLY", groundServiceLive, Tone.GROUND, "FILL STATION · RIGHT WHEEL WELL", compact = true, liveText = "SUPPLYING", offText = "IDLE", modifier = it) },
                        right = { FlowNode(geo, "g-pfp", "connection", "PRESSURE-FILL PORT", groundServiceLive, Tone.GROUND, "ALTERNATE SOURCE · EXTERNAL CART", compact = true, liveText = "SUPPLYING", offText = "IDLE", modifier = it) })
                    Cols2(left = { FlowNode(geo, "g-pump", "handpump", "GROUND SERVICING HAND PUMP", groundServiceLive, Tone.GROUND, "MANUAL · LOW PRESSURE", compact = true, liveText = "PUMPING", offText = "IDLE", modifier = it) }, right = { Spacer(it) })
                    FlowNode(geo, "g-filt", "filter", "HYDRAULIC SERVICING FILTER", groundServiceLive, Tone.GROUND, "0.4–3 MICRON · UPSTREAM OF FILL LINES", compact = true, liveText = "FILTERING", offText = "IDLE", modifier = Modifier.fillMaxWidth())
                    FlowNode(geo, "g-bal", "connection", "SHARED FILL / BALANCE LINE", groundServiceLive, Tone.STANDBY, "→ A · B · STANDBY RESERVOIRS", compact = true, liveText = "FILLING", offText = "IDLE", modifier = Modifier.fillMaxWidth())
                }
            }

            // ── GROUND POWER · A / B INTERCONNECT ──
            FlowBox(FlowHydB.copy(alpha = 0.3f)) {
                Text("GROUND HYDRAULIC POWER · A / B INTERCONNECT", color = FlowSubtle, fontSize = 9.sp, letterSpacing = 0.16.em)
                Spacer(Modifier.height(8.dp))
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    val w = (maxWidth - 24.dp) / 4          // four columns, 8 dp gaps
                    Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FlowNode(geo, "i-ext", "cart", "EXTERNAL HYDRAULIC SOURCE", groundPowerHydLive, Tone.GROUND, "GROUND CART · ~3000 PSI", liveText = "CONNECTED", modifier = Modifier.width(w).fillMaxHeight())
                        FlowNode(geo, "i-gp", "module", "GROUND POWER MODULAR UNIT", groundPowerHydLive, Tone.GROUND, "PRESSURE + RETURN PORTS → B", liveText = "PASS-THROUGH", modifier = Modifier.width(w).fillMaxHeight())
                        FlowNode(geo, "i-valve", "valve", "GROUND INTERCONNECT VALVE", interconnectActual, Tone.GROUND, if (interconnectActual) "OPEN · B → A · CHECK BLOCKS A → B" else "CLOSED · CHECK BLOCKS A → B", liveText = "OPEN", offText = "CLOSED", modifier = Modifier.width(w).fillMaxHeight())
                        FlowNode(geo, "i-park", "connection", "PARKING BRAKE INTERLOCK", s.parkingBrake, Tone.GROUND, if (s.parkingBrake) "RELAY ENERGIZED · VALVE MAY OPEN" else "RELEASED · VALVE CLOSES", liveText = "SET", offText = "RELEASED", modifier = Modifier.width(w).fillMaxHeight())
                    }
                }
            }

            // ── pressure strip ──
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((label, p, live, tone) in listOf(Quad("A", s.hydAPress, aLive, Tone.A), Quad("B", s.hydBPress, bLive, Tone.B), Quad("S", s.hydSPress, stbyLive, Tone.STANDBY))) {
                    val c = tone.color()
                    Text("$label · ${psi(p)}", color = if (live) c else FlowSubtle, fontFamily = FontFamily.Monospace, fontSize = 10.sp, textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f).background(if (live) c.copy(alpha = 0.05f) else Color.Transparent, RoundedCornerShape(8.dp)).border(1.dp, if (live) c.copy(alpha = 0.5f) else FlowBorder, RoundedCornerShape(8.dp)).padding(6.dp))
                }
            }
        }
    }
}

private data class Quad(val label: String, val p: Double, val live: Boolean, val tone: Tone)
