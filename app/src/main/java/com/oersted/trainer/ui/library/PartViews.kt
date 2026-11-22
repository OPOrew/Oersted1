@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.oersted.trainer.ui.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.data.Part
import com.oersted.trainer.data.SystemDef
import com.oersted.trainer.ui.common.Classic737Palette

/**
 * Shared web chrome for the Hangar / System / Library pages: components/ui/badge.tsx tones, library/PartCard.tsx
 * (PartCard, PartDetail, relatedParts) and the "eyebrow + display title" page header.
 */
enum class BadgeTone { MUTED, OK, CAUTION, ACCENT }

@Composable
fun WebBadge(text: String, tone: BadgeTone = BadgeTone.MUTED) {
    val scheme = MaterialTheme.colorScheme
    val c = when (tone) {
        BadgeTone.MUTED -> scheme.onSurfaceVariant
        BadgeTone.OK -> Classic737Palette.Ok
        BadgeTone.CAUTION -> Classic737Palette.Caution
        BadgeTone.ACCENT -> scheme.primary
    }
    Text(
        text.uppercase(), color = c, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.08.em,
        modifier = Modifier.border(1.dp, c.copy(alpha = if (tone == BadgeTone.MUTED) 0.35f else 0.5f), RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

/** web: `font-display text-[11px] uppercase tracking-[0.2em] text-subtle` eyebrow above an `h1`. */
@Composable
fun PageHeader(eyebrow: String, title: String, blurb: String? = null, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(eyebrow.uppercase(), color = Classic737Palette.Subtle, fontSize = 11.sp, letterSpacing = 0.2.em)
        Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 30.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.02).em)
        if (blurb != null) Text(blurb, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.padding(top = 8.dp))
    }
}

@Composable
fun SectionLabel(text: String, spacing: Float = 0.16f) {
    Text(text.uppercase(), color = Classic737Palette.Subtle, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = spacing.em)
}

/** web PartCard. */
@Composable
fun PartCard(part: Part, systems: List<SystemDef>, selected: Boolean, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val sys = systems.firstOrNull { it.id == part.system }
    Surface(
        modifier.fillMaxWidth().clickable { onSelect(part.id) },
        shape = RoundedCornerShape(8.dp),
        color = if (selected) scheme.surfaceVariant else scheme.surface,
        border = BorderStroke(1.dp, if (selected) scheme.primary else scheme.outline.copy(alpha = 0.5f)),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(part.name, color = scheme.onSurface, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                Box(Modifier.padding(start = 8.dp)) { WebBadge("ATA ${part.ata}") }
            }
            Text("${sys?.title ?: ""} · ${part.group}".uppercase(), color = Classic737Palette.Subtle, fontSize = 11.sp, letterSpacing = 0.16.em, modifier = Modifier.padding(top = 4.dp))
            Text(part.function, color = scheme.onSurfaceVariant, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
private fun Block(title: String, body: String) {
    Column {
        SectionLabel(title)
        Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 22.sp, modifier = Modifier.padding(top = 4.dp))
    }
}

/** web PartDetail. */
@Composable
fun PartDetail(part: Part, systems: List<SystemDef>, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val sys = systems.firstOrNull { it.id == part.system }
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), color = scheme.surface, border = BorderStroke(1.dp, scheme.outline.copy(alpha = 0.5f))) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Column {
                Text("ATA ${part.ata} · ${sys?.title ?: ""} · ${part.group}".uppercase(), color = Classic737Palette.Subtle, fontSize = 11.sp, letterSpacing = 0.18.em)
                Text(part.name, color = scheme.onSurface, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
            }
            Block("Function", part.function)
            Block("System flow", part.flow)
            Block("Relationships", part.relationships)
            Column {
                SectionLabel("Technical specs")
                FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    part.specs.forEach { WebBadge(it, BadgeTone.ACCENT) }
                }
            }
            Block("Controls & indication", part.controls)
        }
    }
}

/** web relatedParts (kept for parity; used by hotspot popovers on the web). */
fun relatedParts(part: Part, all: List<Part>, n: Int = 3): List<Part> = all.filter { it.system == part.system && it.id != part.id }.take(n)
