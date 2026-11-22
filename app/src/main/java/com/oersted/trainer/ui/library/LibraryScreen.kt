package com.oersted.trainer.ui.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.data.AmmChapter
import com.oersted.trainer.data.AmmMeta
import com.oersted.trainer.data.Part
import com.oersted.trainer.data.SystemDef
import com.oersted.trainer.ui.common.Classic737Palette

/**
 * Port of routes/library.tsx: header (book · customer · Rev), search + system filter chips, the part list with the
 * selected part's detail (the web puts them side by side from lg up; stacked here as on its mobile layout) and the
 * "AMM chapter index" grid, where chapters modeled in the trainer carry an "In lab" badge.
 */
@Composable
fun LibraryScreen(parts: List<Part>, systems: List<SystemDef>, meta: AmmMeta, chapters: List<AmmChapter>) {
    var query by rememberSaveable { mutableStateOf("") }
    var sysId by rememberSaveable { mutableStateOf("all") }
    var selectedId by rememberSaveable { mutableStateOf(parts.firstOrNull()?.id) }
    val needle = query.trim().lowercase()
    val filtered = parts.filter { p ->
        (sysId == "all" || p.system == sysId) &&
            (needle.isEmpty() || "${p.name} ${p.function} ${p.ata} ${p.group} ${p.controls}".lowercase().contains(needle))
    }
    val part = parts.firstOrNull { it.id == selectedId } ?: filtered.firstOrNull()
    val scheme = MaterialTheme.colorScheme

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            PageHeader(
                "${meta.book} · ${meta.customer} · Rev ${meta.revision}", "Component library",
                "Function, flow, relationships, specs, and cockpit interface — aligned to the task-card technical references and the AMM/IPC chapter list in Drive.",
            )
        }
        item {
            OutlinedTextField(
                value = query, onValueChange = { query = it }, singleLine = true,
                placeholder = { Text("Search valves, actuators, lights…") },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
        }
        item {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                LibraryChip("All", sysId == "all") { _ -> sysId = "all" }
                systems.forEach { LibraryChip(it.short, sysId == it.id) { _ -> sysId = it.id } }
            }
        }
        items(filtered, key = { it.id }) { p -> PartCard(p, systems, selected = p.id == part?.id, onSelect = { selectedId = it }) }
        if (filtered.isEmpty()) item { Text("No components match.", color = scheme.onSurfaceVariant, fontSize = 14.sp, modifier = Modifier.padding(16.dp)) }
        item { if (part != null) PartDetail(part, systems) }
        item {
            Column(Modifier.padding(top = 24.dp)) {
                Text("AMM chapter index", color = scheme.onSurface, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "From AMM/IPC · 737-12 USA AMM D6-37106. Highlighted chapters are modeled in this trainer.",
                    color = scheme.onSurfaceVariant, fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
        items(chapters, key = { it.ata }) { ch ->
            Surface(
                Modifier.fillMaxWidth(), shape = RoundedCornerShape(6.dp),
                color = if (ch.trainer) scheme.surfaceVariant else scheme.surface,
                border = BorderStroke(1.dp, if (ch.trainer) scheme.primary.copy(alpha = 0.3f) else scheme.outline.copy(alpha = 0.5f)),
            ) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(Modifier.weight(1f)) {
                        Text(ch.ata, color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 14.sp, modifier = Modifier.padding(end = 8.dp))
                        Text(ch.title, color = scheme.onSurface, fontSize = 14.sp)
                    }
                    if (ch.trainer) WebBadge("In lab", BadgeTone.OK)
                }
            }
        }
    }
}

/** web library FilterChip: h-11 pill, filled with the foreground colour when active. */
@Composable
private fun LibraryChip(label: String, active: Boolean, onClick: (Unit) -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Surface(
        Modifier.height(44.dp).clickable { onClick(Unit) },
        shape = RoundedCornerShape(6.dp),
        color = if (active) scheme.onSurface else scheme.surface,
        border = BorderStroke(1.dp, if (active) scheme.onSurface else scheme.outline.copy(alpha = 0.5f)),
    ) {
        Box(Modifier.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
            Text(label.uppercase(), color = if (active) scheme.surface else scheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.12.em)
        }
    }
}
