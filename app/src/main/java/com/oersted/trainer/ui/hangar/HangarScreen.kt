@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.oersted.trainer.ui.hangar

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.data.Part
import com.oersted.trainer.data.SystemDef
import com.oersted.trainer.sim.Interlock
import com.oersted.trainer.sim.LogEntry
import com.oersted.trainer.ui.aircraft.AircraftPlan
import com.oersted.trainer.ui.aircraft.aircraftSystemColor
import com.oersted.trainer.ui.cockpit.CockpitModel
import com.oersted.trainer.ui.common.Classic737Palette
import com.oersted.trainer.ui.library.BadgeTone
import com.oersted.trainer.ui.library.PartDetail
import com.oersted.trainer.ui.library.SectionLabel
import com.oersted.trainer.ui.library.WebBadge
import com.oersted.trainer.ui.panel.GroundModule
import com.oersted.trainer.ui.panel.Overhead
import kotlin.math.roundToInt

/**
 * Port of routes/index.tsx (Hangar): airframe schematic with live badges and legend, AMM source card with the
 * airframe dimensions, the selected part or the live interlocks, the systems grid, the full Overhead, ground module and
 * event log. The system cards open the SystemScreen (web: /systems/$id).
 */
private val AIRCRAFT_DIMS = listOf(
    "Length" to "100 ft 2 in", "Wingspan" to "93 ft 0 in", "Height" to "36 ft 10 in",
    "Engines" to "2 × JT8D", "APU" to "GTCP85", "Manifold" to "40–46 psi",
)

@Composable
fun HangarScreen(
    systems: List<SystemDef>,
    parts: List<Part>,
    ammSource: String,
    cockpit: CockpitModel,
    onOpenSystem: (String) -> Unit,
) {
    val sim by cockpit.simState.collectAsState()
    val derived by cockpit.derived.collectAsState()
    val log by cockpit.log.collectAsState()
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    val part = parts.firstOrNull { it.id == selected }
    val scheme = MaterialTheme.colorScheme

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), color = scheme.surfaceVariant.copy(alpha = 0.4f), border = BorderStroke(1.dp, scheme.outline.copy(alpha = 0.5f))) {
                Column(Modifier.padding(12.dp)) {
                    Text("AIRFRAME LAYOUT · 737-200", color = Classic737Palette.Subtle, fontSize = 11.sp, letterSpacing = 0.2.em)
                    Text("Hangar schematic", color = scheme.onSurface, fontSize = 30.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.02).em)
                    FlowRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        WebBadge("APU ${sim.apuRpm.roundToInt()}%", if (derived.apuAvailable) BadgeTone.OK else BadgeTone.MUTED)
                        WebBadge("ENG 1", if (derived.eng1Running) BadgeTone.OK else BadgeTone.MUTED)
                        WebBadge("ENG 2", if (derived.eng2Running) BadgeTone.OK else BadgeTone.MUTED)
                        WebBadge("DUAL BLEED", if (derived.dualBleed) BadgeTone.CAUTION else BadgeTone.MUTED)
                        WebBadge("GEAR ${if (sim.gearPos > 0.9) "DN" else if (sim.gearPos < 0.1) "UP" else "TR"}", if (sim.gearPos > 0.9) BadgeTone.OK else BadgeTone.ACCENT)
                    }
                    Box(Modifier.padding(top = 12.dp)) {
                        AircraftPlan(sim = sim, derived = derived, allParts = parts, activeSystem = null, selectedId = selected, onSelect = { selected = it })
                    }
                    FlowRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Legend(aircraftSystemColor("pneumatic"), "Bleed manifold")
                        Legend(aircraftSystemColor("hydraulics"), "Hydraulic A")
                        Legend(aircraftSystemColor("flightcontrols"), "Hydraulic B")
                        Legend(aircraftSystemColor("apu"), "APU")
                        Legend(aircraftSystemColor("aircond"), "Packs")
                    }
                }
            }
        }
        item {
            Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), color = scheme.surface, border = BorderStroke(1.dp, scheme.outline.copy(alpha = 0.5f))) {
                Column(Modifier.padding(16.dp)) {
                    SectionLabel(ammSource, 0.18f)
                    Text(
                        "Click a node on the airframe, then throw the matching overhead switch. Lights, duct pressure, and hydraulic tapes respond with AMM interlocks — fuel valve before the inlet door, 95% before bleed, System A for the gear.",
                        color = scheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 22.sp, modifier = Modifier.padding(top = 8.dp),
                    )
                    Column(Modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        AIRCRAFT_DIMS.chunked(2).forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                row.forEach { (label, value) ->
                                    Column(Modifier.weight(1f).background(scheme.surfaceVariant.copy(alpha = 0.5f), RoundedCornerShape(6.dp)).padding(horizontal = 12.dp, vertical = 8.dp)) {
                                        Text(label.uppercase(), color = Classic737Palette.Subtle, fontSize = 10.sp, letterSpacing = 0.16.em)
                                        Text(value, color = scheme.onSurface, fontFamily = FontFamily.Monospace, fontSize = 14.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        item { if (part != null) PartDetail(part, systems) else InterlockList(derived.interlocks) }
        items(systems.size) { i ->
            val sys = systems[i]
            Surface(Modifier.fillMaxWidth().clickable { onOpenSystem(sys.id) }, shape = RoundedCornerShape(12.dp), color = scheme.surface, border = BorderStroke(1.dp, scheme.outline.copy(alpha = 0.5f))) {
                Column(Modifier.padding(16.dp)) {
                    Text("ATA ${sys.ata}".uppercase(), color = Classic737Palette.Subtle, fontSize = 11.sp, letterSpacing = 0.16.em)
                    Text(sys.title, color = scheme.onSurface, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
                    Text(sys.blurb, color = scheme.onSurfaceVariant, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
                    Text("OPEN LAYOUT →", color = scheme.primary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.14.em, modifier = Modifier.padding(top = 12.dp))
                }
            }
        }
        item { Overhead(cockpit, focus = "all") }
        item { GroundModule(cockpit, sim, derived) }
        item { EventLog(log) }
    }
}

@Composable
private fun Legend(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).background(color, CircleShape))
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, modifier = Modifier.padding(start = 6.dp))
    }
}

@Composable
private fun InterlockList(interlocks: List<Interlock>) {
    val scheme = MaterialTheme.colorScheme
    Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), color = scheme.surface, border = BorderStroke(1.dp, scheme.outline.copy(alpha = 0.5f))) {
        Column(Modifier.padding(16.dp)) {
            SectionLabel("Live interlocks", 0.18f)
            if (interlocks.isEmpty()) {
                Text("No inhibit messages. Start the APU from cold and dark, or inject a fault on a system page.", color = scheme.onSurfaceVariant, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
            } else {
                Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (il in interlocks) {
                        val c = when (il.tone) { "warn" -> Classic737Palette.Warn; "caution" -> Classic737Palette.Caution; else -> null }
                        Text(
                            il.text, color = if (c != null) scheme.onSurface else scheme.onSurfaceVariant, fontSize = 14.sp,
                            modifier = Modifier.fillMaxWidth()
                                .background((c ?: scheme.surfaceVariant).copy(alpha = if (c != null) 0.10f else 0.5f), RoundedCornerShape(6.dp))
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EventLog(log: List<LogEntry>) {
    val scheme = MaterialTheme.colorScheme
    Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), color = scheme.surface, border = BorderStroke(1.dp, scheme.outline.copy(alpha = 0.5f))) {
        Column(Modifier.padding(16.dp)) {
            SectionLabel("Event log", 0.18f)
            Column(Modifier.padding(top = 8.dp).heightIn(max = 192.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (e in log) {
                    val c = when (e.tone) { "ok" -> Classic737Palette.Ok; "caution" -> Classic737Palette.Caution; "warn" -> Classic737Palette.Warn; else -> Classic737Palette.Subtle }
                    Row {
                        Text(e.tone.uppercase(), color = c, fontSize = 10.sp, letterSpacing = 0.05.em, modifier = Modifier.padding(end = 8.dp))
                        Text(e.text, color = scheme.onSurfaceVariant, fontSize = 14.sp)
                    }
                }
            }
        }
    }
}
