package com.oersted.trainer.ui.procedures

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Procedures
import com.oersted.trainer.ui.cockpit.CockpitModel
import com.oersted.trainer.ui.common.Classic737Palette
import com.oersted.trainer.ui.flightplan.PlanBtn
import com.oersted.trainer.ui.flightplan.PlanButton
import com.oersted.trainer.ui.library.BadgeTone
import com.oersted.trainer.ui.library.PageHeader
import com.oersted.trainer.ui.library.WebBadge
import com.oersted.trainer.ui.panel.GroundModule
import com.oersted.trainer.ui.panel.Overhead

/**
 * Port of routes/procedures.tsx with the web classes: the two category buttons (accent / warn when selected), procedure chips
 * (selected = filled `bg-fg`, "ATA n" over the title), live step cards (done `border-ok/30 bg-ok/10`, active `border-accent bg-raised`,
 * round index with a check mark), the summary card with its Complete / In progress badge, the reset / APU buttons, the Overhead
 * and the ground-service module. The web's lg two-column layout is stacked, as on its phone breakpoint.
 */
@Composable
fun ProceduresScreen(cockpit: CockpitModel) {
    val scheme = MaterialTheme.colorScheme
    val s by cockpit.simState.collectAsState()
    val d by cockpit.derived.collectAsState()

    var category by rememberSaveable { mutableStateOf(Procedures.ProcedureCategory.NORMAL.name) }
    val cat = Procedures.ProcedureCategory.valueOf(category)
    val visible = Procedures.PROCEDURES.filter { it.category == cat }
    var procId by rememberSaveable { mutableStateOf(Procedures.PROCEDURES.first().id) }
    val proc = visible.firstOrNull { it.id == procId } ?: visible.first()

    val doneFlags = proc.steps.map { it.done(s, d) }
    val current = doneFlags.indexOfFirst { !it }
    val complete = current == -1

    val panel = scheme.surfaceVariant.copy(alpha = 0.4f)
    val border = scheme.outline.copy(alpha = 0.5f)

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            PageHeader(
                "Guided sequences", "Procedures",
                "Each step is live against the same airplane. The next action is highlighted. Emergency / abnormal sequences are training simulations based on the supplied 737-200 manuals; use the approved aircraft checklist/QRH for real-world operation.",
            )
        }
        item {
            Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CategoryButton("Normal Procedures", cat == Procedures.ProcedureCategory.NORMAL, scheme.primary, panel, border) {
                    category = Procedures.ProcedureCategory.NORMAL.name
                    procId = Procedures.PROCEDURES.first { it.category == Procedures.ProcedureCategory.NORMAL }.id
                }
                CategoryButton("Emergency / Abnormal", cat == Procedures.ProcedureCategory.EMERGENCY, Classic737Palette.Warn, panel, border) {
                    category = Procedures.ProcedureCategory.EMERGENCY.name
                    procId = Procedures.PROCEDURES.first { it.category == Procedures.ProcedureCategory.EMERGENCY }.id
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                visible.forEach { p ->
                    val on = p.id == proc.id
                    val shape = RoundedCornerShape(6.dp)
                    Column(
                        Modifier.then(if (on) Modifier.background(scheme.onSurface, shape).border(1.dp, scheme.onSurface, shape) else Modifier.background(panel, shape).border(1.dp, border, shape))
                            .clickable { procId = p.id }.padding(horizontal = 12.dp, vertical = 8.dp),
                    ) {
                        val ink = if (on) scheme.surface else scheme.onSurfaceVariant
                        Text("ATA ${p.ata}".uppercase(), color = ink.copy(alpha = 0.7f), fontSize = 10.sp, letterSpacing = 0.16.em)
                        Text(p.title, color = ink, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        itemsIndexed(proc.steps) { i, st ->
            val done = doneFlags[i]
            val active = i == current
            val shape = RoundedCornerShape(12.dp)
            val ok = Classic737Palette.Ok
            Row(
                Modifier.fillMaxWidth().padding(top = if (i == 0) 8.dp else 0.dp)
                    .background(if (done) ok.copy(alpha = 0.10f) else if (active) scheme.surfaceVariant else panel, shape)
                    .border(1.dp, if (done) ok.copy(alpha = 0.3f) else if (active) scheme.primary else border, shape)
                    .padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    Modifier.size(28.dp).then(if (done) Modifier.background(ok, CircleShape) else Modifier).border(1.dp, if (done) ok else border, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(if (done) "✓" else "${i + 1}", color = if (done) scheme.surface else scheme.onSurfaceVariant, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                }
                Column {
                    Text(st.title, color = scheme.onSurface, fontWeight = FontWeight.Medium)
                    Text(st.why, color = scheme.onSurfaceVariant, fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp))
                    if (active) Text(st.hint, color = scheme.primary, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
                }
            }
        }
        item {
            val shape = RoundedCornerShape(12.dp)
            Row(
                Modifier.padding(top = 8.dp).fillMaxWidth().background(panel, shape).border(1.dp, border, shape).padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(proc.title.uppercase(), color = Classic737Palette.Subtle, fontSize = 11.sp, letterSpacing = 0.16.em)
                    Text(proc.summary, color = scheme.onSurfaceVariant, fontSize = 14.sp)
                }
                Box(Modifier.padding(start = 8.dp)) { if (complete) WebBadge("Complete", BadgeTone.OK) else WebBadge("In progress", BadgeTone.MUTED) }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PlanButton("Reset airplane", variant = PlanBtn.SECONDARY, small = true) { cockpit.coldAndDark() }
                PlanButton("APU running preset", variant = PlanBtn.OUTLINE, small = true) { cockpit.readyApu() }
            }
        }
        // web right column continues with the live overhead panel and the ground-service module
        item { Overhead(cockpit) }
        item { GroundModule(cockpit, s, d) }
    }
}

/** web category button: `rounded-md border px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em]`. */
@Composable
private fun CategoryButton(text: String, selected: Boolean, accent: Color, panel: Color, border: Color, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(6.dp)
    Text(
        text.uppercase(), color = if (selected) scheme.onSurface else scheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.14.em,
        modifier = Modifier.then(if (selected) Modifier.background(accent.copy(alpha = 0.10f), shape).border(1.dp, accent, shape) else Modifier.background(panel, shape).border(1.dp, border, shape))
            .clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 8.dp),
    )
}
