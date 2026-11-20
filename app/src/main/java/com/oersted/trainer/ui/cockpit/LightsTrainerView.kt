package com.oersted.trainer.ui.cockpit

import com.oersted.trainer.ui.overhead.P5Cutout
import com.oersted.trainer.ui.overhead.P5WideCutout
import com.oersted.trainer.ui.overhead.BottomStrip
import com.oersted.trainer.ui.overhead.DomeWhite
import com.oersted.trainer.ui.overhead.CabinServicePanel
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.LightStatus
import com.oersted.trainer.sim.LightsDerive
import com.oersted.trainer.sim.LightsTrainerRules
import com.oersted.trainer.sim.PitotStaticRules
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.ui.panel.LightTone
import com.oersted.trainer.ui.panel.PanelCaptionLight
import com.oersted.trainer.ui.panel.PanelControlSlider

/**
 * Port of LightsTrainer.tsx (ATA 33 lighting trainer): bus lamps, phase presets, four tabs (Controls, Aircraft, Deck + cabin,
 * Components). Logic lives in [LightsTrainerRules] / [LightsDerive]. The AMM 33-40 exterior drawing is
 * ExteriorLightsDiagramView.kt. Compose only; verify on CI.
 */

private val LineC = Color(0xFF39414B)
private val SubtleC = Color(0xFF8F9AA5)
private val OkC = Color(0xFF65C798)
private val WarnC = Color(0xFFE24B4B)
private val FgC = Color(0xFFE6E1D2)
private val Amber = Color(0xFFFFB340)

private fun lightColor(name: String): Color = when (name) {
    "red" -> Color(0xFFFF4D4D)
    "green" -> Color(0xFF35E08C)
    "amber" -> Color(0xFFFFB340)
    else -> Color(0xFFF6F1DF)
}

private fun pct(v: Double): String = "${Math.floor(v * 100 + 0.5).toLong()}%"

@Composable
private fun Dot(l: LightStatus, size: Int = 12) {
    val c = lightColor(l.color)
    val pulse = rememberInfiniteTransition(label = "flash")
    val a by pulse.animateFloat(1f, 0.35f, infiniteRepeatable(tween(450), RepeatMode.Reverse), label = "a")
    val base = if (l.lit) (0.4 + 0.6 * l.level).toFloat() else 1f
    Box(
        Modifier.size(size.dp).alpha(if (l.lit && l.flash != null) base * a else base)
            .background(if (l.lit) c else Color(0xFF23272C), CircleShape).border(1.dp, Color(0x66000000), CircleShape),
    )
}

@Composable
private fun LBox(title: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 3.dp).background(Color(0x4D14171B), RoundedCornerShape(4.dp)).border(1.dp, LineC, RoundedCornerShape(4.dp)).padding(8.dp)) {
        Text(title.uppercase(), color = SubtleC, fontSize = 9.sp, modifier = Modifier.padding(bottom = 6.dp))
        content()
    }
}

/** web Tog: label with ON/OFF and a detail line. */
@Composable
private fun Tog(label: String, on: Boolean, detail: String?, modifier: Modifier, onText: String = "ON", offText: String = "OFF", onClick: () -> Unit) {
    Column(
        modifier.background(if (on) Color(0x0DFFFFFF) else Color(0xFF0E1013), RoundedCornerShape(4.dp))
            .border(1.dp, if (on) OkC.copy(alpha = 0.5f) else LineC, RoundedCornerShape(4.dp)).clickable(onClick = onClick).padding(6.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label.uppercase(), color = FgC, fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text(if (on) onText else offText, color = if (on) OkC else SubtleC, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
        }
        if (detail != null) Text(detail.uppercase(), color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 7.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** web Seg: a row of choices. */
@Composable
private fun Seg(label: String, value: String, options: List<Pair<String, String>>, detail: String?, modifier: Modifier, onChange: (String) -> Unit) {
    Column(modifier.background(Color(0xFF0E1013), RoundedCornerShape(4.dp)).border(1.dp, LineC, RoundedCornerShape(4.dp)).padding(6.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label.uppercase(), color = FgC, fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            if (detail != null) Text(detail.uppercase(), color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 7.sp, maxLines = 1)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for ((v, text) in options) {
                val sel = value == v
                Text(
                    text.uppercase(), color = if (sel) FgC else SubtleC, fontSize = 8.sp,
                    modifier = Modifier.weight(1f).background(if (sel) Color(0x26D6A845) else Color.Transparent, RoundedCornerShape(4.dp))
                        .border(1.dp, if (sel) Color(0x99D6A845) else LineC, RoundedCornerShape(4.dp)).clickable { onChange(v) }.padding(horizontal = 4.dp, vertical = 5.dp),
                )
            }
        }
    }
}

@Composable
private fun Pair2(left: @Composable (Modifier) -> Unit, right: @Composable (Modifier) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        left(Modifier.weight(1f))
        right(Modifier.weight(1f))
    }
}

@Composable
private fun SmallBtn(text: String, active: Boolean = false, warn: Boolean = false, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val border = if (warn) WarnC.copy(alpha = 0.6f) else if (active) Color(0x99D6A845) else LineC
    Text(
        text.uppercase(), color = if (active || warn) FgC else SubtleC, fontSize = 8.sp,
        modifier = modifier.background(if (warn) Color(0x26E24B4B) else if (active) Color(0x1AD6A845) else Color(0xFF0E1013), RoundedCornerShape(4.dp))
            .border(1.dp, border, RoundedCornerShape(4.dp)).clickable(onClick = onClick).padding(horizontal = 8.dp, vertical = 7.dp),
    )
}

@Composable
private fun LampRow(l: LightStatus) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp).background(Color(0xFF0E1013), RoundedCornerShape(4.dp)).border(1.dp, LineC, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Dot(l)
        Text(l.label.uppercase(), color = FgC, fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        val txt = if (l.lit) (if (l.level < 0.99) pct(l.level) else "LIT") else l.reason.ifEmpty { "OFF" }
        Text(txt.uppercase(), color = if (l.lit) OkC else if (l.reason.isNotEmpty() && l.commanded > 0.02) WarnC else SubtleC, fontFamily = FontFamily.Monospace, fontSize = 7.sp)
    }
}

@Composable
private fun CabinStrip(lights: List<LightStatus>) {
    fun g(id: String) = lights.first { it.id == id }
    val main = g("cab-main"); val aisle = g("emer-aisle"); val ovhd = g("emer-ovhd"); val read = g("cab-read")
    val zones = listOf("ENTRY" to g("cab-entry"), "CABIN" to main, "GALLEY" to g("cab-galley"), "LAV" to g("cab-lav"))
    Column {
        Box(Modifier.fillMaxWidth().height(48.dp).background(Color(0xFF14171B), RoundedCornerShape(22.dp)).border(1.dp, LineC, RoundedCornerShape(22.dp))) {
            Box(Modifier.padding(start = 12.dp, end = 12.dp, top = 4.dp).fillMaxWidth().height(6.dp).alpha(if (main.lit) (0.25 + 0.6 * main.level).toFloat() else 0.06f).background(Color.White, RoundedCornerShape(3.dp)))
            Box(Modifier.padding(start = 12.dp, end = 12.dp, top = 14.dp).fillMaxWidth().height(4.dp).alpha(if (ovhd.lit) 0.85f else 0.05f).background(Color(0xFFFCD34D), RoundedCornerShape(2.dp)))
            Box(Modifier.align(Alignment.BottomCenter).padding(start = 12.dp, end = 12.dp, bottom = 8.dp).fillMaxWidth().height(4.dp).alpha(if (aisle.lit) 0.9f else 0.05f).background(Color(0xFF6EE7B7), RoundedCornerShape(2.dp)))
            Row(Modifier.align(Alignment.TopCenter).padding(top = 20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                repeat(8) { Box(Modifier.size(6.dp).background(if (read.lit) Color(0xFFF6F1DF) else Color(0xFF2A2F35), CircleShape)) }
            }
        }
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for ((name, l) in zones) {
                Text("$name ${if (l.lit) "ON" else "OFF"}", color = if (l.lit) FgC else SubtleC, fontFamily = FontFamily.Monospace, fontSize = 7.sp, modifier = Modifier.weight(1f).border(1.dp, LineC, RoundedCornerShape(4.dp)).padding(horizontal = 4.dp, vertical = 2.dp))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LightsTrainerSection(s: SimState, d: Derived, cockpit: CockpitModel) {
    var tab by remember { mutableStateOf("controls") }
    var filter by remember { mutableStateOf("All") }
    val lights = d.lights
    fun lamp(id: String): LightStatus = lights.first { it.id == id }
    fun stat(id: String): String { val l = lamp(id); return if (l.lit) "LIT" else l.reason.ifEmpty { "OFF" } }
    val dc = d.dcPower
    val test = s.ltTest && dc
    fun ann(c: Boolean) = test || (dc && c)
    fun p(edit: SimState.() -> Unit) = cockpit.patchSim(edit)
    val slide = { v: Double -> PitotStaticRules.stepSnap(v, 0.01) }

    Text("Lights", style = MaterialTheme.typography.titleMedium)

    val buses = listOf(
        "AC XFR 1" to d.transferBus1Powered, "AC XFR 2" to d.transferBus2Powered, "DC BUS 1" to d.dcBus1Powered, "DC BUS 2" to d.dcBus2Powered,
        "BAT BUS" to d.batteryBusPowered, "HOT BAT" to d.hotBatteryBusPowered, "28V AC" to d.ac28vPowered, "STBY AC" to d.standbyAcPowered,
    )
    buses.chunked(4).forEach { row ->
        Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            row.forEach { (n, on) -> PanelCaptionLight(n, on, LightTone.ELEC, Modifier.weight(1f)) }
        }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("${lights.count { it.lit }} of ${lights.size} lights lit".uppercase(), color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
        Text("${lights.count { it.commanded > 0.02 && !it.lit }} selected but dark".uppercase(), color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
    }
    Spacer(Modifier.height(4.dp))
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        for (name in LightsTrainerRules.PRESET_NAMES) SmallBtn(name) { cockpit.applySim { LightsTrainerRules.applyPreset(it, name) } }
    }
    Spacer(Modifier.height(6.dp))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        for ((k, name) in listOf("controls" to "Controls", "aircraft" to "Aircraft", "deck" to "Deck + cabin", "components" to "Components")) {
            SmallBtn(name, active = tab == k, modifier = Modifier.weight(1f)) { tab = k }
        }
    }
    Spacer(Modifier.height(6.dp))

    @Composable
    fun ExteriorSwitches() = LBox("P5 · Exterior lights") {
        P5WideCutout(cockpit) { pp -> BottomStrip(pp) }
        Spacer(Modifier.height(4.dp))
        Tog("Logo", s.ltLogo, stat("logo"), Modifier.fillMaxWidth()) { p { ltLogo = !s.ltLogo } }
    }

    @Composable
    fun DeckSwitches() = LBox("Flight deck lighting") {
        Seg("Master dim", s.ltMasterDim, listOf("BRT" to "BRT", "DIM" to "DIM"), null, Modifier.fillMaxWidth()) { v -> p { ltMasterDim = v } } 
        Pair2({ m -> Tog("Map L (Capt)", s.ltMapCapt, stat("map-capt"), m) { p { ltMapCapt = !s.ltMapCapt } } }, { m -> Tog("Map R (F/O)", s.ltMapFo, stat("map-fo"), m) { p { ltMapFo = !s.ltMapFo } } })
        Pair2({ m -> Tog("Storm", s.ltStorm, stat("storm"), m) { p { ltStorm = !s.ltStorm } } }, { m -> Tog("Compass", s.ltCompass, stat("compass"), m) { p { ltCompass = !s.ltCompass } } })
        Pair2({ m -> Tog("Observer read", s.ltObserver, stat("observer"), m) { p { ltObserver = !s.ltObserver } } }, { m -> Tog("Lightshield emer", s.ltShieldEmer, stat("shield-emer"), m) { p { ltShieldEmer = !s.ltShieldEmer } } })
        Tog("Annunciator test", s.ltTest, if (dc) "LIGHTS ALL LAMPS" else "NO DC POWER", Modifier.fillMaxWidth(), onText = "TEST") { p { ltTest = !s.ltTest } }
        Spacer(Modifier.height(8.dp))
        PanelControlSlider("OVERHEAD PANEL (${pct(s.ltPanelOvhd)})", s.ltPanelOvhd, { v -> p { ltPanelOvhd = slide(v) } }, 0.0, 1.0)
        PanelControlSlider("CAPTAIN PANEL (${pct(s.ltPanelCapt)})", s.ltPanelCapt, { v -> p { ltPanelCapt = slide(v) } }, 0.0, 1.0)
        PanelControlSlider("FIRST OFFICER PANEL (${pct(s.ltPanelFo)})", s.ltPanelFo, { v -> p { ltPanelFo = slide(v) } }, 0.0, 1.0)
        PanelControlSlider("PEDESTAL (${pct(s.ltPanelPed)})", s.ltPanelPed, { v -> p { ltPanelPed = slide(v) } }, 0.0, 1.0)
    }

    @Composable
    fun CabinSwitches() = LBox("Cabin · signs · emergency") {
        val three = listOf("OFF" to "OFF", "DIM" to "DIM", "BRT" to "BRT")
        Pair2({ m -> Seg("Cabin lights", s.ltCabin, three, stat("cab-main"), m) { v -> p { ltCabin = v } } }, { m -> Tog("Entry", s.ltEntry, stat("cab-entry"), m) { p { ltEntry = !s.ltEntry } } })
        Pair2({ m -> Tog("Galley", s.ltGalley, stat("cab-galley"), m) { p { ltGalley = !s.ltGalley } } }, { m -> Tog("Lavatory", s.ltLav, stat("cab-lav"), m) { p { ltLav = !s.ltLav } } })
        Pair2({ m -> Tog("Reading lights", s.ltReading, stat("cab-read"), m) { p { ltReading = !s.ltReading } } }, { m -> Tog("Sidewall / cove", s.ltSidewall, stat("cab-sidewall"), m) { p { ltSidewall = !s.ltSidewall } } })
        Pair2({ m -> Tog("Window lights", s.ltWindow, stat("cab-window"), m) { p { ltWindow = !s.ltWindow } } }, { m -> Tog("Attendant work", s.ltAttWork, stat("att-work"), m) { p { ltAttWork = !s.ltAttWork } } })
        Pair2({ m -> Tog("Passenger calls", s.ltCall, stat("pass-call"), m) { p { ltCall = !s.ltCall } } }, { m -> Tog("Lav mirror", s.ltLavMirror, stat("lav-mirror"), m) { p { ltLavMirror = !s.ltLavMirror } } })
        Pair2({ m -> Tog("Threshold", s.ltThreshold, stat("threshold"), m) { p { ltThreshold = !s.ltThreshold } } }, { m -> Tog("Closets", s.ltCloset, stat("closet"), m) { p { ltCloset = !s.ltCloset } } })
        Pair2({ m -> Tog("Cargo compartments", s.ltCargo, stat("fwd-cargo-dome"), m) { p { ltCargo = !s.ltCargo } } }, { m -> Tog("Equipment comp", s.ltEquip, stat("equip-flood"), m) { p { ltEquip = !s.ltEquip } } })
        Pair2({ m -> Tog("Aft accessory", s.ltAftAccessory, stat("aft-accessory"), m) { p { ltAftAccessory = !s.ltAftAccessory } } }, { m -> Tog("APU compartment", s.ltApuComp, stat("apu-comp"), m) { p { ltApuComp = !s.ltApuComp } } })
        Tog("Tail cone", s.ltTailCone, stat("tail-cone"), Modifier.fillMaxWidth()) { p { ltTailCone = !s.ltTailCone } }
        P5Cutout(cockpit, 2) { pp -> DomeWhite(pp); CabinServicePanel(pp) }
        Text("AUTO SIGNS FOLLOW GEAR (NOT UP) AND FLAPS. ARMED LIGHTS THE EMERGENCY LIGHTS WHEN DC POWER IS LOST.", color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
    }

    when (tab) {
        "controls" -> { ExteriorSwitches(); DeckSwitches(); CabinSwitches() }
        "aircraft" -> {
            ExteriorSwitches()
            LBox("Exterior lights · AMM 33-40-0 diagrams") { ExteriorLightsDiagram(lights) }
            lights.filter { it.group == "Exterior" }.forEach { LampRow(it) }
        }
        "deck" -> {
            DeckSwitches(); CabinSwitches()
            LBox("Flight deck") {
                for (l in lights.filter { it.group == "Flight deck" }) {
                    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp).background(Color(0xFF0E1013), RoundedCornerShape(4.dp)).border(1.dp, LineC, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Dot(l)
                        Text(l.label.uppercase(), color = FgC, fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Box(Modifier.width(56.dp).height(6.dp).background(Color(0x66000000), RoundedCornerShape(3.dp))) {
                            Box(Modifier.fillMaxWidth(l.level.toFloat().coerceIn(0f, 1f)).height(6.dp).background(Color(0xCCFBBF24), RoundedCornerShape(3.dp)))
                        }
                        Text((if (l.lit) pct(l.level) else l.reason.ifEmpty { "OFF" }).uppercase(), color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 7.sp, modifier = Modifier.width(56.dp))
                    }
                }
            }
            LBox("Annunciators${if (test) " · TEST" else ""}${if (s.ltMasterDim == "DIM") " · DIM" else ""}") {
                val items = listOf(
                    Triple("FIRE WARN", ann(d.fireWarn), LightTone.WARN), Triple("MASTER CAUTION", ann(d.masterCaution), LightTone.CAUTION),
                    Triple("GEN 1 OFF BUS", ann(d.gen1OffBus), LightTone.ELEC), Triple("GEN 2 OFF BUS", ann(d.gen2OffBus), LightTone.ELEC),
                    Triple("APU GEN OFF BUS", ann(d.apuGenOffBus), LightTone.ELEC), Triple("HYD A LOW", ann(d.hydALow), LightTone.CAUTION),
                    Triple("HYD B LOW", ann(d.hydBLow), LightTone.CAUTION), Triple("NOSE GEAR DN", ann(d.gearLights.nose.green), LightTone.OK),
                    Triple("NOSE GEAR TRANSIT", ann(d.gearLights.nose.red), LightTone.WARN), Triple("L MAIN DN", ann(d.gearLights.leftMain.green), LightTone.OK),
                    Triple("L MAIN TRANSIT", ann(d.gearLights.leftMain.red), LightTone.WARN), Triple("R MAIN DN", ann(d.gearLights.rightMain.green), LightTone.OK),
                    Triple("R MAIN TRANSIT", ann(d.gearLights.rightMain.red), LightTone.WARN),
                )
                Column(Modifier.alpha(if (s.ltMasterDim == "DIM") 0.65f else 1f)) {
                    items.chunked(3).forEach { row ->
                        Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            row.forEach { (n, on, tone) -> PanelCaptionLight(n, on, tone, Modifier.weight(1f)) }
                            repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
                if (!dc) Text("NO DC POWER — ANNUNCIATORS AND TEST ARE DEAD.", color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
            }
            LBox("Cabin") {
                Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (id in listOf("sign-ns", "sign-sb")) {
                        val l = lamp(id)
                        Column(
                            Modifier.weight(1f).background(if (l.lit) Amber.copy(alpha = (0.15 + 0.35 * l.level).toFloat()) else Color.Transparent, RoundedCornerShape(4.dp))
                                .border(1.dp, if (l.lit) Amber else LineC, RoundedCornerShape(4.dp)).padding(vertical = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(l.label.replace(" sign", "").uppercase(), color = if (l.lit) Amber else SubtleC, fontSize = 9.sp)
                            Text(if (l.lit) "ON" else l.reason.ifEmpty { "OFF" }, color = if (l.lit) Amber else SubtleC, fontFamily = FontFamily.Monospace, fontSize = 7.sp)
                        }
                    }
                }
                CabinStrip(lights)
                Spacer(Modifier.height(6.dp))
                lights.filter { it.group == "Cabin" && !it.id.startsWith("sign-") }.forEach { LampRow(it) }
            }
            LBox("Emergency lighting") {
                lights.filter { it.group == "Emergency" }.forEach { LampRow(it) }
                Text("SWITCH ${s.ltEmergency} · PACK ${d.lightComponents.firstOrNull { it.id == "emer-pack" }?.state}".uppercase(), color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
            }
        }
        else -> {
            LBox("Lighting components") {
                for (c in d.lightComponents) {
                    Column(Modifier.fillMaxWidth().padding(vertical = 2.dp).background(Color(0xFF0E1013), RoundedCornerShape(4.dp)).border(1.dp, if (c.powered) LineC else WarnC.copy(alpha = 0.4f), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 6.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(c.name.uppercase(), color = FgC, fontSize = 8.sp, modifier = Modifier.weight(1f))
                            Text(if (c.powered) c.state.uppercase() else "NO POWER", color = if (c.powered) OkC else WarnC, fontFamily = FontFamily.Monospace, fontSize = 7.sp)
                        }
                        Text(c.function, color = SubtleC, fontSize = 8.sp)
                        Text("${c.group} · ${c.location} · feeds: ${c.feeds}".uppercase(), color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 7.sp)
                    }
                }
            }
            LBox("All lights · fail bulb / pull breaker") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (g in listOf("All", "Exterior", "Flight deck", "Cabin", "Emergency")) SmallBtn(g, active = filter == g) { filter = g }
                }
                Spacer(Modifier.height(6.dp))
                for (l in lights.filter { filter == "All" || it.group == filter }) {
                    Column(Modifier.fillMaxWidth().padding(vertical = 2.dp).background(Color(0xFF0E1013), RoundedCornerShape(4.dp)).border(1.dp, LineC, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Dot(l)
                            Text(l.label.uppercase(), color = FgC, fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            Text(if (l.lit) "LIT" else l.reason.ifEmpty { "OFF" }, color = if (l.lit) OkC else if (l.reason.isNotEmpty() && l.commanded > 0.02) WarnC else SubtleC, fontFamily = FontFamily.Monospace, fontSize = 7.sp)
                        }
                        Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("${l.supply} · CB ${l.cb}".uppercase(), color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 7.sp, modifier = Modifier.weight(1f))
                            val failed = LightsDerive.lightFailed(s, l.id)
                            SmallBtn(if (failed) "Bulb failed" else "Fail bulb", warn = failed) { cockpit.applySim { LightsTrainerRules.toggleBulbFailure(it, l.id) } }
                            val out = LightsDerive.cbPulled(s, l.cb)
                            SmallBtn(if (out) "CB out" else "Pull CB", warn = out) { cockpit.applySim { LightsTrainerRules.toggleBreaker(it, l.cb) } }
                        }
                    }
                }
            }
            LBox("Circuit breakers (P6)") {
                LightsDerive.LIGHT_CBS.chunked(2).forEach { row ->
                    Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        row.forEach { cb -> Tog(cb, !LightsDerive.cbPulled(s, cb), null, Modifier.weight(1f), "IN", "OUT") { cockpit.applySim { LightsTrainerRules.toggleBreaker(it, cb) } } }
                        repeat(2 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
                Spacer(Modifier.height(6.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    SmallBtn("Reset breakers + bulbs", modifier = Modifier.weight(1f)) { cockpit.applySim { LightsTrainerRules.resetBreakersAndBulbs(it) } }
                    SmallBtn("Reset switches (keep faults)", modifier = Modifier.weight(1f)) { cockpit.applySim { LightsTrainerRules.resetSwitches(it) } }
                }
            }
        }
    }
}
