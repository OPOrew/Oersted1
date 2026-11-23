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
import com.oersted.trainer.platform.AudioEngine
import com.oersted.trainer.ui.cockpit.CockpitModel
import com.oersted.trainer.ui.common.ShellBottomNav
import com.oersted.trainer.ui.common.ShellHeader
import com.oersted.trainer.ui.common.ShellIconKind
import com.oersted.trainer.ui.common.ShellNavItem
import com.oersted.trainer.ui.common.StatusStrip
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.ui.platform.LocalConfiguration
import com.oersted.trainer.ui.hangar.HangarScreen
import com.oersted.trainer.ui.library.LibraryScreen
import com.oersted.trainer.ui.procedures.ProceduresScreen
import com.oersted.trainer.ui.systems.SystemScreen
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.OutlinedButton
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.mutableStateOf
import com.oersted.trainer.ui.flightplan.FlightPlanScreen
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.oersted.trainer.ui.cockpit.CockpitScreen
import androidx.compose.runtime.DisposableEffect
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

// Same order and labels as the web AppShell NAV (Hangar, Flight deck, Flight plan, Procedures, Library).
private enum class Tab(val label: String) {
    HANGAR("Hangar"),
    FLIGHT_DECK("Flight deck"),
    FLIGHT_PLAN("Flight plan"),
    PROCEDURES("Procedures"),
    LIBRARY("Library"),
}

@Composable
fun AppRoot(lightMode: Boolean, onToggleTheme: () -> Unit) {
    val context = LocalContext.current
    val repo = remember { Repository(context) }
    var tabIndex by rememberSaveable { androidx.compose.runtime.mutableStateOf(0) }
    // Which system the Hangar has opened (web: /systems/$id). Null shows the list.
    var openSystemId by rememberSaveable { mutableStateOf<String?>(null) }
    val tab = Tab.entries[tabIndex]
    // The sim and the phase controller run for the whole app, like the web's SimTicker, on the main thread.
    val cockpit = remember { CockpitModel(CoroutineScope(SupervisorJob() + Dispatchers.Main)) }
    val planStore = remember { PlanStore(context) }
    val cockpitPlanLabel by cockpit.activePlanLabel.collectAsState()
    val sim by cockpit.simState.collectAsState()
    val derived by cockpit.derived.collectAsState()
    DisposableEffect(cockpit) {
        cockpit.start()
        onDispose { cockpit.stop() }
    }
    // Sound (audio.ts): on while the app is in front unless SOUND was turned off. Reads the live sim through audioFeed and clicks on switch changes.
    val audio = remember { AudioEngine(context) }
    DisposableEffect(audio, cockpit) {
        cockpit.onSwitchClick = { audio.switchClick() }
        audio.start { cockpit.audioFeed() }
        val owner = generateSequence(context) { (it as? android.content.ContextWrapper)?.baseContext }
            .filterIsInstance<androidx.lifecycle.LifecycleOwner>().firstOrNull()
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            when (event) {
                androidx.lifecycle.Lifecycle.Event.ON_START -> audio.onForeground()
                androidx.lifecycle.Lifecycle.Event.ON_STOP -> audio.onBackground()
                else -> {}
            }
        }
        if (owner != null) owner.lifecycle.addObserver(observer) else audio.onForeground()
        onDispose {
            owner?.lifecycle?.removeObserver(observer)
            cockpit.onSwitchClick = null
            audio.release()
        }
    }

    val navItems = remember {
        listOf(
            ShellNavItem("Hangar", ShellIconKind.PLANE),
            ShellNavItem("Flight deck", ShellIconKind.PANEL_LEFT),
            ShellNavItem("Flight plan", ShellIconKind.TAKEOFF),
            ShellNavItem("Procedures", ShellIconKind.PLAY),
            ShellNavItem("Library", ShellIconKind.BOOK_OPEN),
        )
    }
    val wide = LocalConfiguration.current.screenWidthDp >= 768
    Scaffold(
        // The header and bottom nav apply the status / navigation bar insets themselves (edge-to-edge on API 35).
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            // Web AppShell header (logo, title, "model · book Rev revision", theme button, md+ nav) with the StatusStrip inside it.
            ShellHeader(
                title = "Classic 737 Line Lab",
                subtitle = "${repo.amm.meta.model} · ${repo.amm.meta.book} Rev ${repo.amm.meta.revision}",
                lightMode = lightMode,
                onToggleTheme = onToggleTheme,
                items = navItems,
                selected = tabIndex,
                onSelect = { tabIndex = it },
            ) {
                StatusStrip(
                    s = sim,
                    d = derived,
                    onTimeScale = { cockpit.cycleTimeScale() },
                    onReadyApu = { cockpit.readyApu() },
                    onColdAndDark = { cockpit.coldAndDark() },
                )
            }
        },
        bottomBar = {
            if (!wide) ShellBottomNav(navItems, tabIndex) { tabIndex = it }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            when (tab) {
                Tab.HANGAR -> {
                    val open = openSystemId?.let { id -> repo.systems.firstOrNull { it.id == id } }
                    if (open != null) {
                        SystemScreen(
                            system = open,
                            systems = repo.systems,
                            allParts = repo.parts,
                            cockpit = cockpit,
                            onOpenSystem = { openSystemId = it },
                            onBack = { openSystemId = null },
                        )
                    } else {
                        HangarScreen(repo.systems, repo.parts, repo.amm.meta.source, cockpit) { openSystemId = it }
                    }
                }
                Tab.FLIGHT_DECK -> CockpitScreen(cockpit, audio)
                Tab.FLIGHT_PLAN -> FlightPlanScreen(planStore, cockpit)
                Tab.PROCEDURES -> ProceduresScreen(cockpit)
                Tab.LIBRARY -> LibraryScreen(repo.parts, repo.systems, repo.amm.meta, repo.amm.chapters)
            }
        }
    }
}
