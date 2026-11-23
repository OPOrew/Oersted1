@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.oersted.trainer.ui.flightplan

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.ui.common.Classic737Palette

/**
 * Chrome of routes/flight-plan.tsx: `inputClass` text boxes, Field, SectionTitle, Metric, the Button variants and the
 * rounded `border-border bg-panel` section cards. Colours follow the app scheme (as Hangar / Library / System pages).
 */
@Composable
internal fun planBorder(): Color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)

@Composable
internal fun planInset(): Color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)

/** `rounded-xl border border-border bg-panel p-4` section. */
@Composable
internal fun PlanSection(modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f), borderColor: Color = planBorder(), content: @Composable () -> Unit) {
    Surface(modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), color = color, border = BorderStroke(1.dp, borderColor)) {
        Column(Modifier.padding(16.dp)) { content() }
    }
}

/** web Field: label above the control, `font-display text-[11px] uppercase tracking-[0.13em] text-subtle`. */
@Composable
internal fun PlanField(label: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth()) {
        Text(label.uppercase(), color = Classic737Palette.Subtle, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.13.em, modifier = Modifier.padding(bottom = 6.dp))
        content()
    }
}

/** web SectionTitle: accent glyph, `text-lg font-semibold` title and `text-xs text-muted` subtitle. */
@Composable
internal fun PlanSectionTitle(glyph: String, title: String, subtitle: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(glyph, color = MaterialTheme.colorScheme.primary, fontSize = 16.sp, modifier = Modifier.padding(top = 2.dp))
        Column {
            Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
        }
    }
}

/** web Metric: `rounded-md border bg-inset px-3 py-2`, tiny uppercase label over a mono value. */
@Composable
internal fun PlanMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier.border(1.dp, planBorder(), RoundedCornerShape(6.dp)).background(planInset(), RoundedCornerShape(6.dp)).padding(horizontal = 12.dp, vertical = 8.dp)) {
        Text(label.uppercase(), color = Classic737Palette.Subtle, fontSize = 10.sp, letterSpacing = 0.15.em, maxLines = 2)
        Text(value, color = MaterialTheme.colorScheme.onSurface, fontFamily = FontFamily.Monospace, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.padding(top = 4.dp))
    }
}

/** Two metrics per row (`grid-cols-2`), or [cols] columns. */
@Composable
internal fun PlanMetricGrid(items: List<Pair<String, String>>, cols: Int = 2) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.chunked(cols).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (l, v) -> PlanMetric(l, v, Modifier.weight(1f)) }
                repeat(cols - row.size) { Box(Modifier.weight(1f)) }
            }
        }
    }
}

enum class PlanBtn { DEFAULT, SECONDARY, OUTLINE }

/** web Button: default (accent fill), secondary (raised) and outline. */
@Composable
internal fun PlanButton(text: String, modifier: Modifier = Modifier, variant: PlanBtn = PlanBtn.DEFAULT, enabled: Boolean = true, small: Boolean = false, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(8.dp)
    val (bg, fg, bd) = when (variant) {
        PlanBtn.DEFAULT -> Triple(scheme.primary, scheme.onPrimary, scheme.primary)
        PlanBtn.SECONDARY -> Triple(scheme.surfaceVariant, scheme.onSurface, scheme.surfaceVariant)
        PlanBtn.OUTLINE -> Triple(Color.Transparent, scheme.onSurface, scheme.outline.copy(alpha = 0.6f))
    }
    Box(
        modifier.alpha(if (enabled) 1f else 0.5f).background(bg, shape).border(1.dp, bd, shape).clickable(enabled = enabled, onClick = onClick).padding(horizontal = if (small) 12.dp else 16.dp, vertical = if (small) 6.dp else 10.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = fg, fontSize = if (small) 13.sp else 14.sp, fontWeight = FontWeight.Medium) }
}

/** Small icon-style action (the waypoint row arrows and trash). */
@Composable
internal fun PlanIconButton(glyph: String, enabled: Boolean = true, tint: Color = MaterialTheme.colorScheme.onSurfaceVariant, onClick: () -> Unit) {
    Box(Modifier.alpha(if (enabled) 1f else 0.3f).clickable(enabled = enabled, onClick = onClick).padding(horizontal = 10.dp, vertical = 8.dp), contentAlignment = Alignment.Center) {
        Text(glyph, color = tint, fontSize = 16.sp)
    }
}

/** web `inputClass` text box: `rounded-md border bg-surface px-3 py-2 text-sm`. */
@Composable
internal fun PlanInput(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    numeric: Boolean = false,
    decimal: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
) {
    val scheme = MaterialTheme.colorScheme
    BasicTextField(
        value = value, onValueChange = onValueChange, singleLine = singleLine, minLines = minLines,
        textStyle = TextStyle(color = scheme.onSurface, fontSize = 14.sp),
        cursorBrush = SolidColor(scheme.primary),
        keyboardOptions = if (numeric) KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number) else KeyboardOptions.Default,
        modifier = modifier.fillMaxWidth(),
        decorationBox = { inner ->
            Box(Modifier.fillMaxWidth().background(scheme.surface, RoundedCornerShape(6.dp)).border(1.dp, planBorder(), RoundedCornerShape(6.dp)).padding(horizontal = 12.dp, vertical = 10.dp)) {
                if (value.isEmpty() && placeholder.isNotEmpty()) Text(placeholder, color = scheme.onSurfaceVariant.copy(alpha = 0.6f), fontSize = 14.sp)
                inner()
            }
        },
    )
}

/** web `<select className={inputClass}>`: a dropdown of (value, label, enabled) rows. */
@Composable
internal fun PlanSelect(
    selectedLabel: String,
    options: List<Triple<String, String, Boolean>>,
    modifier: Modifier = Modifier,
    onSelect: (String) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    var open by remember { mutableStateOf(false) }
    Box(modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().background(scheme.surface, RoundedCornerShape(6.dp)).border(1.dp, planBorder(), RoundedCornerShape(6.dp))
                .clickable { open = true }.padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(selectedLabel, color = scheme.onSurface, fontSize = 14.sp, maxLines = 2, modifier = Modifier.weight(1f))
            Text("▾", color = scheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(start = 8.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.widthIn(min = 220.dp)) {
            options.forEach { (value, label, enabled) ->
                DropdownMenuItem(text = { Text(label, fontSize = 14.sp) }, enabled = enabled, onClick = { open = false; onSelect(value) })
            }
        }
    }
}

/** Flow of buttons / chips (`flex flex-wrap gap-2`). */
@Composable
internal fun PlanFlow(content: @Composable () -> Unit) {
    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { content() }
}

/** Round index badge of the route rows. */
@Composable
internal fun PlanBadgeCircle(text: String, color: Color, size: Int = 28, fontSize: Int = 10) {
    Box(Modifier.size(size.dp).border(1.dp, color, androidx.compose.foundation.shape.CircleShape), contentAlignment = Alignment.Center) {
        Text(text, color = color, fontSize = fontSize.sp, fontWeight = FontWeight.Bold)
    }
}
