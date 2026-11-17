package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedButton
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.oersted.trainer.ui.overhead.OverheadP5
import com.oersted.trainer.ui.overhead.OverheadZoom
import com.oersted.trainer.ui.panel.MainInstrumentPanel
import com.oersted.trainer.ui.pedestal.CenterPedestal
import com.oersted.trainer.ui.pedestal.PedestalOtherFunctions
import com.oersted.trainer.ui.pedestal.ThrustLinkButton
import androidx.compose.foundation.layout.BoxWithConstraints

/** Cockpit tab (web routes/cockpit.tsx): heading, sound controls, then only the main instrument panel, P5 overhead and P8 pedestal. */
@Composable
fun CockpitScreen(model: CockpitModel, audio: com.oersted.trainer.platform.AudioEngine) {
    val log by model.log.collectAsState()
    val simState by model.simState.collectAsState()
    val derived by model.derived.collectAsState()
    var trainingOpen by remember { mutableStateOf(false) }
    var logOpen by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        // web routes/cockpit.tsx: heading, sound controls, note, then only MAIN INSTRUMENT PANEL, P5 FORWARD OVERHEAD and P8 CENTER PEDESTAL
        Text("737-200 FLIGHT DECK TRAINER", style = MaterialTheme.typography.labelSmall)
        Text("Cockpit panels", style = MaterialTheme.typography.headlineMedium)
        SoundControls(audio)
        Text(
            "Primary controls are grouped by their aircraft panel location. Training scenarios, ground servicing and fault injection are " +
                "available from the separate right-edge Training Console so they do not look like real flight-deck controls.",
            style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(12.dp))
        // The main panel is a 3060 x 988 design canvas: it scrolls sideways at a readable zoom. Zoom steps of 10 % from 30 % to 100 %.
        var panelScale by remember { mutableStateOf(0.3f) }
        PanelSection(
            eyebrow = "MAIN INSTRUMENT PANEL · 737-200 (RP-C8009 / N267AU)",
            title = "Interactive instrument panel — every control is live",
            trailing = {
                OutlinedButton(onClick = { panelScale = (panelScale - 0.1f).coerceAtLeast(0.3f) }, enabled = panelScale > 0.31f) { Text("-") }
                Text("${Math.round(panelScale * 100)}%", style = MaterialTheme.typography.labelSmall)
                OutlinedButton(onClick = { panelScale = (panelScale + 0.1f).coerceAtMost(1.0f) }, enabled = panelScale < 0.99f) { Text("+") }
            },
            caption = "Turn the battery on for displays and lights (unpowered, the instrument flags show as on the aircraft). Gear lever, flaps, " +
                "autobrake, antiskid, hydraulic / brake pressure, engine dials and air-data instruments follow the live simulation; clocks, " +
                "selectors, radios, test keys and brightness knobs are local. Tap left / right of a selector knob to step it.",
        ) {
            MainInstrumentPanel(cockpit = model, scale = panelScale, modifier = Modifier.fillMaxWidth())
        }
        Spacer(Modifier.height(16.dp))
        var overheadZoom by remember { mutableStateOf(OverheadZoom.FIT) }
        PanelSection(
            eyebrow = "P5 · FORWARD OVERHEAD · 737-200",
            title = "Interactive overhead — every control is live",
            trailing = {
                Text("SIZE", style = MaterialTheme.typography.labelSmall)
                OverheadZoom.values().forEach { z ->
                    if (z == overheadZoom) Button(onClick = { overheadZoom = z }) { Text(z.label) }
                    else OutlinedButton(onClick = { overheadZoom = z }) { Text(z.label) }
                }
            },
            caption = "Lights and displays need DC power — flip BAT first. Tap a switch to move it; knobs turn by dragging around them.",
        ) {
            OverheadP5(cockpit = model, zoom = overheadZoom)
        }
        Spacer(Modifier.height(16.dp))
        PanelSection(
            eyebrow = "P8 · CENTER PEDESTAL · 737-200",
            title = "Interactive pedestal — every control is live",
            trailing = { ThrustLinkButton(cockpit = model) },
            caption = "Drag the thrust handles, flap grip, speed-brake arm, start / parking-brake levers, trim wheels and the STAB drum; turn the " +
                "knobs by dragging round them (double-tap the rudder knob to centre). Tap a thrust handle to press its A/T DISENGAGE switch; " +
                "tap a reverse claw to deploy / stow. Needs DC power for displays and lights (turn BATTERY on). Fire handles are locked until " +
                "a fire warning exists — press LOCK OVRD to test.",
        ) {
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                CenterPedestal(cockpit = model, width = maxWidth)
            }
            Spacer(Modifier.height(8.dp))
            var otherOpen by remember { mutableStateOf(false) }
            OutlinedButton(onClick = { otherOpen = !otherOpen }, modifier = Modifier.fillMaxWidth()) {
                Text("${if (otherOpen) "▼" else "▶"} OTHER PEDESTAL FUNCTIONS", style = MaterialTheme.typography.labelSmall)
            }
            if (otherOpen) {
                Spacer(Modifier.height(8.dp))
                PedestalOtherFunctions(cockpit = model)
            }
        }
    }
    LogDrawerView(
        entries = log,
        open = logOpen,
        onToggle = { logOpen = !logOpen },
        onClose = { logOpen = false },
        onClear = { model.clearLog() },
    )
    if (trainingOpen) {
        TrainingConsoleView(
            s = simState,
            d = derived,
            change = model::applySim,
            note = { text, edit -> model.patchSimNote(text, edit) },
            cockpit = model,
            onClose = { trainingOpen = false },
        )
    } else {
        OutlinedButton(
            onClick = { trainingOpen = true },
            shape = RoundedCornerShape(topStart = 8.dp, bottomStart = 8.dp),
            modifier = Modifier.align(Alignment.TopEnd).padding(top = 8.dp),
        ) { Text("TRAINING") }
    }
    }
}

/** web `<section className="rounded-xl border border-[#4a4f56] bg-[#202328] p-3">`: eyebrow, title, optional trailing controls, the panel and a caption. */
@Composable
private fun PanelSection(
    eyebrow: String,
    title: String,
    caption: String,
    trailing: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {},
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp)
    Column(
        Modifier.fillMaxWidth()
            .background(Color(0xFF202328), shape)
            .border(1.dp, Color(0xFF4A4F56), shape)
            .padding(12.dp),
    ) {
        Text(eyebrow, style = MaterialTheme.typography.labelSmall, color = Color(0xFF9AA0A8))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            trailing()
        }
        Spacer(Modifier.height(8.dp))
        content()
        Spacer(Modifier.height(8.dp))
        Text(caption, style = MaterialTheme.typography.labelSmall, color = Color(0xFF9AA0A8))
    }
}
