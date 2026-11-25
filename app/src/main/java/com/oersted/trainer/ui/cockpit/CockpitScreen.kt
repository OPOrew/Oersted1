package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedButton
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import com.oersted.trainer.ui.panel.MainInstrumentPanel
import com.oersted.trainer.ui.pedestal.CenterPedestal
import com.oersted.trainer.ui.pedestal.PedestalOtherFunctions
import com.oersted.trainer.ui.pedestal.ThrustLinkButton
import androidx.compose.foundation.horizontalScroll
import com.oersted.trainer.ui.pedestal.PEDESTAL_STAGE_W

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
        // Every panel has the same VIEW selector: 30 %, 50 % or FULL (100 %, scrolls sideways).
        var panelView by remember { mutableStateOf(PanelView.V30) }
        PanelSection(
            eyebrow = "MAIN INSTRUMENT PANEL · 737-200 (RP-C8009 / N267AU)",
            title = "Interactive instrument panel — every control is live",
            trailing = { PanelViewSelector(panelView) { panelView = it } },
            caption = "Turn the battery on for displays and lights (unpowered, the instrument flags show as on the aircraft). Gear lever, flaps, " +
                "autobrake, antiskid, hydraulic / brake pressure, engine dials and air-data instruments follow the live simulation; clocks, " +
                "selectors, radios, test keys and brightness knobs are local. Tap left / right of a selector knob to step it.",
        ) {
            MainInstrumentPanel(cockpit = model, scale = panelView.factor, modifier = Modifier.fillMaxWidth())
        }
        Spacer(Modifier.height(16.dp))
        var overheadView by remember { mutableStateOf(PanelView.V30) }
        PanelSection(
            eyebrow = "P5 · FORWARD OVERHEAD · 737-200",
            title = "Interactive overhead — every control is live",
            trailing = { PanelViewSelector(overheadView) { overheadView = it } },
            caption = "Lights and displays need DC power — flip BAT first. Tap a switch to move it; knobs turn by dragging around them.",
        ) {
            OverheadP5(cockpit = model, scale = overheadView.factor)
        }
        Spacer(Modifier.height(16.dp))
        var pedestalView by remember { mutableStateOf(PanelView.V50) }
        PanelSection(
            eyebrow = "P8 · CENTER PEDESTAL · 737-200",
            title = "Interactive pedestal — every control is live",
            trailing = { ThrustLinkButton(cockpit = model); PanelViewSelector(pedestalView) { pedestalView = it } },
            caption = "Drag the thrust handles, flap grip, speed-brake arm, start / parking-brake levers, trim wheels and the STAB drum; turn the " +
                "knobs by dragging round them (double-tap the rudder knob to centre). Tap a thrust handle to press its A/T DISENGAGE switch; " +
                "tap a reverse claw to deploy / stow. Needs DC power for displays and lights (turn BATTERY on). Fire handles are locked until " +
                "a fire warning exists — press LOCK OVRD to test.",
        ) {
            // 700 dp design width: 30 % / 50 % sit centred, FULL scrolls sideways
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                Box(Modifier.horizontalScroll(rememberScrollState())) {
                    CenterPedestal(cockpit = model, width = (PEDESTAL_STAGE_W * pedestalView.factor).dp)
                }
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
            audioEnabled = audio.on.collectAsState().value,
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
        Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.fillMaxWidth())
        // controls on their own scrollable line, so three VIEW buttons never squeeze the title on a phone
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            trailing()
        }
        Spacer(Modifier.height(8.dp))
        content()
        Spacer(Modifier.height(8.dp))
        Text(caption, style = MaterialTheme.typography.labelSmall, color = Color(0xFF9AA0A8))
    }
}

/** The cockpit panels' VIEW sizes: 30 %, 50 % or FULL (design size, scrolls sideways). */
internal enum class PanelView(val label: String, val factor: Float) {
    V30("30%", 0.3f),
    V50("50%", 0.5f),
    FULL("FULL", 1.0f),
}

@Composable
private fun PanelViewSelector(selected: PanelView, onSelect: (PanelView) -> Unit) {
    Text("VIEW", style = MaterialTheme.typography.labelSmall)
    PanelView.values().forEach { v ->
        if (v == selected) Button(onClick = { onSelect(v) }, contentPadding = PaddingValues(horizontal = 10.dp)) { Text(v.label) }
        else OutlinedButton(onClick = { onSelect(v) }, contentPadding = PaddingValues(horizontal = 10.dp)) { Text(v.label) }
    }
}
