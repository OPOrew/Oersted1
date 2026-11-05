package com.oersted.trainer.ui.cockpit

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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.oersted.trainer.sim.CockpitReadout

/** Cockpit tab: phase, hint, the key readouts and the phase buttons (each gated as the web's canStart). Not compiled in the sandbox. */
@Composable
fun CockpitScreen(model: CockpitModel) {
    val r by model.readout.collectAsState()
    val sixPack by model.sixPack.collectAsState()
    val log by model.log.collectAsState()
    val simState by model.simState.collectAsState()
    var trainingOpen by remember { mutableStateOf(false) }
    var logOpen by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("COCKPIT", style = MaterialTheme.typography.labelSmall)
        Text(r.phaseLabel, style = MaterialTheme.typography.headlineMedium)
        Text(r.hint, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(12.dp))
        SixPackView(sixPack)
        Spacer(Modifier.height(12.dp))
        Text("ALT ${"%.0f".format(r.altFt)} FT   CAS ${"%.0f".format(r.casKt)} KT   VS ${"%.0f".format(r.vsFpm)} FPM")
        Text("HDG ${"%.0f".format(r.headingDeg)}   THR ${"%.0f".format(r.throttle1 * 100)} %")
        Spacer(Modifier.height(16.dp))
        CockpitReadout.BUTTON_PHASES.forEach { p ->
            val gate = r.gates[p]
            Row(Modifier.fillMaxWidth()) {
                Button(
                    onClick = { model.startPhase(p) },
                    enabled = gate?.ok == true,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(p.label) }
            }
            if (gate != null && !gate.ok) Text(gate.reason, style = MaterialTheme.typography.labelSmall)
            Spacer(Modifier.height(8.dp))
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
        TrainingConsoleView(s = simState, change = model::applySim, onClose = { trainingOpen = false })
    } else {
        OutlinedButton(
            onClick = { trainingOpen = true },
            shape = RoundedCornerShape(topStart = 8.dp, bottomStart = 8.dp),
            modifier = Modifier.align(Alignment.TopEnd).padding(top = 8.dp),
        ) { Text("TRAINING") }
    }
    }
}
