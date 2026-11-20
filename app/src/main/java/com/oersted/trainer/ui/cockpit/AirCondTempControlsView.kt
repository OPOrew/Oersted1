package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.AirConditioningRules as Rules
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.ui.panel.PanelControlSlider

/**
 * Remaining controls of the web AirConditioningTrainerPanel (cockpit.tsx ~1090-1155): per-side P5-17 selector (mode buttons,
 * 65-85 F AUTO SELECTOR, air-mix caption), the four cabin/duct temperature readouts, the fine-mix sliders and the TEMP CONTROL
 * FAULT selectors. Rules are in sim/AirConditioningRules.kt (tested). Compose only; verify on a device.
 */
private val Sub = Color(0xFF8F9AA5)
private val Box0 = Color(0x33000000)
private val Line = Color(0xFF2C323D)
private val Accent = Color(0xFF8BA4B8)

@Composable
private fun Mono(text: String, modifier: Modifier = Modifier, color: Color = Sub, align: TextAlign? = null) =
    Text(text, color = color, fontFamily = FontFamily.Monospace, fontSize = 8.sp, textAlign = align, modifier = modifier)

@Composable
internal fun AirCondTempControls(s: SimState, d: Derived, change: Change) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (left in listOf(true, false)) {
                val mode = Rules.tempMode(s, left)
                Column(Modifier.weight(1f).background(Box0, RoundedCornerShape(4.dp)).border(1.dp, Line, RoundedCornerShape(4.dp)).padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Mono("${if (left) "CONT" else "PASS"} CABIN · P5-17 SELECTOR (ATA 21)")
                    for (pair in Rules.TEMP_MODES.chunked(2)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            for (m in pair) {
                                val lit = Rules.modeButtonLit(mode, m)
                                val label = if (m == "MANUAL_COOL") "MAN COOL" else if (m == "MANUAL_WARM") "MAN WARM" else m
                                Box(
                                    Modifier.weight(1f)
                                        .background(if (lit) Color(0x1A8BA4B8) else Color(0xFF0E1116), RoundedCornerShape(4.dp))
                                        .border(1.dp, if (lit) Color(0xB38BA4B8) else Line, RoundedCornerShape(4.dp))
                                        .clickable { change { Rules.setTempMode(it, left, m) } }
                                        .padding(vertical = 6.dp),
                                    contentAlignment = Alignment.Center,
                                ) { Mono(label, color = if (lit) Accent else Color(0xFFE7E2D6)) }
                            }
                        }
                    }
                    PanelControlSlider(
                        "${if (left) "L" else "R"} AUTO SELECTOR · 65–85°F", Rules.tempSelector(s, left),
                        { v -> change { Rules.setTempSelector(it, left, Math.round(v).toDouble()) } },
                        min = 65.0, max = 85.0, disabled = !Rules.selectorEnabled(s, left),
                    )
                    Mono(Rules.airMixCaption(d, mode, left), modifier = Modifier.fillMaxWidth(), align = TextAlign.Center)
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (t in listOf(
                "CONT CABIN ${Math.round(d.controlCabinTempF)}°F", "CONT DUCT ${Math.round(d.controlCabinSupplyTempF)}°F",
                "PASS CABIN ${Math.round(d.passengerCabinTempF)}°F", "PASS DUCT ${Math.round(d.passengerCabinSupplyTempF)}°F",
            )) {
                Box(Modifier.weight(1f).border(1.dp, Line, RoundedCornerShape(4.dp)).padding(horizontal = 4.dp, vertical = 6.dp)) { Mono(t, color = Color(0xFFE7E2D6)) }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (left in listOf(true, false)) {
                Box(Modifier.weight(1f)) {
                    PanelControlSlider(
                        "${if (left) "CONT" else "PASS"} CABIN FINE MIX (COLD→HOT · LEGACY)", if (left) s.mixCabin else s.mixPass,
                        { v -> change { Rules.setMix(it, left, Math.round(v * 100) / 100.0) } },
                        min = 0.0, max = 1.0, disabled = !Rules.mixEnabled(s, left),
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (left in listOf(true, false)) {
                val value = Rules.tempControlFault(s, left)
                var open by remember { mutableStateOf(false) }
                Column(Modifier.weight(1f).background(Box0, RoundedCornerShape(4.dp)).border(1.dp, Line, RoundedCornerShape(4.dp)).padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Mono("${if (left) "L" else "R"} TEMP CONTROL FAULT")
                    Box {
                        Box(Modifier.fillMaxWidth().background(Color(0xFF090D11), RoundedCornerShape(4.dp)).border(1.dp, Line, RoundedCornerShape(4.dp)).clickable { open = true }.padding(horizontal = 8.dp, vertical = 8.dp)) {
                            Mono((Rules.TEMP_FAULT_OPTIONS.firstOrNull { it.first == value }?.second ?: value) + "  ▾", color = Color(0xFFE7E2D6))
                        }
                        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                            for ((v, label) in Rules.TEMP_FAULT_OPTIONS) {
                                DropdownMenuItem(text = { Mono(label, color = if (v == value) Accent else Color(0xFFE7E2D6)) }, onClick = { open = false; change { Rules.setTempControlFault(it, left, v) } })
                            }
                        }
                    }
                }
            }
        }
    }
}
