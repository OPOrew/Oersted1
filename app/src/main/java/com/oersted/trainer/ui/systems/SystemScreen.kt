@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.oersted.trainer.ui.systems

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.oersted.trainer.data.Part
import com.oersted.trainer.data.SystemDef
import com.oersted.trainer.sim.SimActions
import com.oersted.trainer.ui.aircraft.AircraftPlan
import com.oersted.trainer.ui.cockpit.CockpitModel
import com.oersted.trainer.ui.common.Classic737Palette
import com.oersted.trainer.ui.library.BadgeTone
import com.oersted.trainer.ui.library.PageHeader
import com.oersted.trainer.ui.library.PartCard
import com.oersted.trainer.ui.library.PartDetail
import com.oersted.trainer.ui.library.WebBadge
import com.oersted.trainer.ui.panel.GroundModule
import com.oersted.trainer.ui.panel.Overhead

/**
 * Port of routes/systems.$id.tsx: header, system chips, the aircraft plan with hotspots, the selected part,
 * the fault buttons and the part list.
 * Under the plan: the Overhead focus for the system (web FOCUS map), GroundModule for landing gear / flight controls,
 * the part list and the session-pumps footer.
 */
@Composable
fun SystemScreen(
    system: SystemDef,
    systems: List<SystemDef>,
    allParts: List<Part>,
    cockpit: CockpitModel,
    onOpenSystem: (String) -> Unit,
    onBack: () -> Unit,
) {
    val sim by cockpit.simState.collectAsState()
    val derived by cockpit.derived.collectAsState()
    val parts = allParts.filter { it.system == system.id }
    var selectedId by rememberSaveable(system.id) { mutableStateOf(parts.firstOrNull()?.id) }
    val part = parts.firstOrNull { it.id == selectedId } ?: parts.firstOrNull()

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            OutlinedButton(onClick = onBack) { Text("← Hangar") }
        }
        item {
            PageHeader("ATA ${system.ata} · ${system.panel}", system.title, system.blurb)
        }
        item { WebBadge(system.power, BadgeTone.ACCENT) }
        item {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                systems.forEach { item ->
                    FilterChip(
                        selected = item.id == system.id,
                        onClick = { onOpenSystem(item.id) },
                        label = { Text(item.short) },
                    )
                }
            }
        }
        item {
            FlowRow(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FaultButton("Door jam", "apuDoorJam", sim.faults.apuDoorJam, cockpit)
                FaultButton("Hyd A leak", "hydALeak", sim.faults.hydALeak, cockpit)
                FaultButton("Pack overheat (L)", "packOverheat", sim.faults.packOverheat, cockpit)
                FaultButton("Pack overheat (R)", "packOverheatR", sim.faults.packOverheatR, cockpit)
                FaultButton("Bleed overheat (1)", "bleedOverheat1", sim.faults.bleedOverheat1, cockpit)
                FaultButton("Bleed overheat (2)", "bleedOverheat2", sim.faults.bleedOverheat2, cockpit)
                FaultButton("APU fire detected", "apuFireDetected", sim.faults.apuFireDetected, cockpit)
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Box(Modifier.padding(8.dp)) {
                    AircraftPlan(
                        sim = sim,
                        derived = derived,
                        allParts = allParts,
                        activeSystem = system.id,
                        selectedId = part?.id,
                        onSelect = { selectedId = it },
                        systems = systems,
                    )
                }
            }
        }
        item {
            part?.let { PartDetail(it, systems) }
        }
        item { Overhead(cockpit, focus = SYSTEM_FOCUS[system.id] ?: "all") }
        if (system.id == "landinggear" || system.id == "flightcontrols") item { GroundModule(cockpit, sim, derived) }
        items(parts, key = { it.id }) { p ->
            PartCard(p, systems, selected = p.id == part?.id, onSelect = { selectedId = it })
        }
        item {
            Text(
                "Session pumps: ENG ${if (sim.engHyd1) "1" else "–"} / ${if (sim.elecHyd1) "E1" else "–"}",
                color = Classic737Palette.Subtle, style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun FaultButton(label: String, key: String, active: Boolean, cockpit: CockpitModel) {
    OutlinedButton(
        onClick = {
            cockpit.applySim { s -> SimActions.toggleFault(s, key, System.currentTimeMillis().toDouble()) }
        },
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = if (active) Classic737Palette.Warn.copy(alpha = 0.25f) else Color.Transparent,
        ),
    ) {
        Text(label)
    }
}

/** web systems.$id FOCUS map: which Overhead group each system page shows. */
private val SYSTEM_FOCUS = mapOf(
    "apu" to "apu", "powerplant" to "start", "hydraulics" to "hyd", "aircond" to "bleed", "pneumatic" to "bleed",
    "antiice" to "bleed", "cabin" to "bleed", "flightcontrols" to "flt", "landinggear" to "all", "fuel" to "all",
    "fire" to "all", "electrical" to "elec", "navigation" to "all", "lights" to "all", "oxygen" to "all",
)
