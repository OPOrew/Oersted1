package com.oersted.trainer.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.oersted.trainer.data.Part
import com.oersted.trainer.data.Repository
import com.oersted.trainer.data.SystemDef
import com.oersted.trainer.platform.PlanStore
import com.oersted.trainer.ui.cockpit.CockpitModel
import com.oersted.trainer.ui.flightplan.FlightPlanScreen
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.oersted.trainer.ui.cockpit.CockpitScreen
import androidx.compose.runtime.DisposableEffect
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

private enum class Tab(val label: String) {
    SYSTEMS("Systems"),
    LIBRARY("Library"),
    AMM("AMM"),
    PLAN("Plan"),
    COCKPIT("Cockpit"),
}

@Composable
fun AppRoot() {
    val context = LocalContext.current
    val repo = remember { Repository(context) }
    var tabIndex by rememberSaveable { androidx.compose.runtime.mutableStateOf(0) }
    val tab = Tab.entries[tabIndex]
    // The sim and the phase controller run for the whole app, like the web's SimTicker, on the main thread.
    val cockpit = remember { CockpitModel(CoroutineScope(SupervisorJob() + Dispatchers.Main)) }
    val planStore = remember { PlanStore(context) }
    val cockpitPlanLabel by cockpit.activePlanLabel.collectAsState()
    DisposableEffect(cockpit) {
        cockpit.start()
        onDispose { cockpit.stop() }
    }

    Scaffold(
        bottomBar = {
            NavigationBar {
                Tab.entries.forEachIndexed { i, t ->
                    NavigationBarItem(
                        selected = i == tabIndex,
                        onClick = { tabIndex = i },
                        icon = { Text(t.label.take(1)) },
                        label = { Text(t.label) },
                    )
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            when (tab) {
                Tab.SYSTEMS -> SystemsScreen(repo.systems)
                Tab.LIBRARY -> LibraryScreen(repo.parts)
                Tab.AMM -> AmmScreen(repo)
                Tab.PLAN -> FlightPlanScreen(planStore, cockpitPlanLabel) { draft -> cockpit.activate(draft) }
                Tab.COCKPIT -> CockpitScreen(cockpit)
            }
        }
    }
}

@Composable
private fun Header(eyebrow: String, title: String) {
    Column(Modifier.padding(16.dp)) {
        Text(eyebrow.uppercase(), style = MaterialTheme.typography.labelSmall)
        Text(title, style = MaterialTheme.typography.headlineMedium)
    }
}

@Composable
private fun SystemsScreen(systems: List<SystemDef>) {
    Header("Airframe layout · 737-200", "Systems")
    LazyColumn(contentPadding = PaddingValues(16.dp)) {
        items(systems, key = { it.id }) { s ->
            Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text("ATA ${s.ata} · ${s.short}", style = MaterialTheme.typography.labelMedium)
                    Text(s.title, style = MaterialTheme.typography.titleMedium)
                    Text(s.blurb, style = MaterialTheme.typography.bodyMedium)
                    Text("Power: ${s.power} · Panel: ${s.panel}", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun LibraryScreen(parts: List<Part>) {
    Header("Component library", "${parts.size} parts")
    LazyColumn(contentPadding = PaddingValues(16.dp)) {
        items(parts, key = { it.id }) { p ->
            Card(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text("ATA ${p.ata} · ${p.group}", style = MaterialTheme.typography.labelMedium)
                    Text(p.name, style = MaterialTheme.typography.titleSmall)
                    Text(p.function, style = MaterialTheme.typography.bodyMedium)
                    Text("Flow: ${p.flow}", style = MaterialTheme.typography.bodySmall)
                    Text("Controls: ${p.controls}", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun AmmScreen(repo: Repository) {
    val amm = repo.amm
    Header(amm.meta.source, amm.meta.book + " Rev " + amm.meta.revision)
    LazyColumn(contentPadding = PaddingValues(16.dp)) {
        items(amm.chapters, key = { it.ata }) { c ->
            Text(
                "ATA ${c.ata}  ${c.title}" + if (c.trainer) "  ●" else "",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(vertical = 4.dp),
            )
        }
    }
}

@Composable
private fun CockpitPlaceholder() {
    Column(Modifier.padding(16.dp)) {
        Header("Phase 3", "Cockpit")
        Text(
            "The simulator is not wired to the UI yet. The pure-Kotlin core lives in com.oersted.trainer.sim. " +
                "See docs/HANDOFF.md for port status.",
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}
