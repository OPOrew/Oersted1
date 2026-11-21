package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.ui.common.Classic737Palette

/**
 * The Training Console wrappers of routes/cockpit.tsx: `TrainingGroup` (section card: rounded-lg, border #45402f, bg #1f1e19, p-3,
 * uppercase 10 px title with 0.15 em tracking) and `TrainingSub` (mt-3, border-t #403b2d, pt-3, 9 px title #a9a188, 0.14 em tracking).
 * Every Training Console section is placed inside one of these with the same title the web uses.
 */
internal val TrainingGroupBorder = Color(0xFF45402F)
internal val TrainingGroupBg = Color(0xFF1F1E19)
internal val TrainingRule = Color(0xFF403B2D)
internal val TrainingSubText = Color(0xFFA9A188)

@Composable
fun TrainingGroup(title: String, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth().background(TrainingGroupBg, RoundedCornerShape(8.dp)).border(1.dp, TrainingGroupBorder, RoundedCornerShape(8.dp)).padding(12.dp),
    ) {
        Text(title.uppercase(), color = Classic737Palette.Fg, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.15.em, modifier = Modifier.padding(bottom = 8.dp))
        content()
    }
}

@Composable
fun TrainingSub(title: String, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth()) {
        TrainingSubHeader(title)
        content()
    }
}

/** Just the divider + title of a TrainingSub, for sections whose body follows as siblings. */
@Composable
fun TrainingSubHeader(title: String) {
    Column(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(TrainingRule))
        Text(title.uppercase(), color = TrainingSubText, fontSize = 9.sp, letterSpacing = 0.14.em, modifier = Modifier.padding(top = 12.dp, bottom = 8.dp))
    }
}

/** The web console button: rounded border-border bg-inset px-2 py-2, 9 px uppercase tracking-wide text-fg, 45 % when disabled. */
@Composable
fun WebButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, accent: Boolean = false, tint: Color? = null, onClick: () -> Unit) {
    val shape = RoundedCornerShape(4.dp)
    Box(
        modifier.alpha(if (enabled) 1f else 0.45f)
            .background(if (tint != null) tint.copy(alpha = 0.10f) else if (accent) Classic737Palette.Accent.copy(alpha = 0.05f) else Classic737Palette.Inset, shape)
            .border(1.dp, if (tint != null) tint.copy(alpha = 0.4f) else if (accent) Classic737Palette.Accent.copy(alpha = 0.5f) else Classic737Palette.Border, shape)
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 8.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text.uppercase(), color = Classic737Palette.Fg, fontSize = 9.sp, letterSpacing = 0.025.em, textAlign = TextAlign.Center) }
}

class GridBtn(val text: String, val enabled: Boolean = true, val accent: Boolean = false, val tint: Color? = null, val onClick: () -> Unit)

/** `grid grid-cols-N gap-2` of web buttons. */
@Composable
fun ButtonGrid(items: List<GridBtn>, cols: Int = 2, gap: Int = 8) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(gap.dp)) {
        for (row in items.chunked(cols)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(gap.dp)) {
                for (b in row) WebButton(b.text, Modifier.weight(1f), b.enabled, b.accent, b.tint, b.onClick)
                repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/** `rounded border bg-inset px-2 py-2 font-mono text-[9px] uppercase`: the read-only boxes of the web console. */
@Composable
fun InfoBox(text: String, modifier: Modifier = Modifier, color: Color = Classic737Palette.Subtle, border: Color = Classic737Palette.Border, size: Int = 9) {
    Text(
        text.uppercase(), color = color, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace, fontSize = size.sp,
        modifier = modifier.background(Classic737Palette.Inset, RoundedCornerShape(4.dp)).border(1.dp, border, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 8.dp),
    )
}

/** web `Tape`: label (10 px semibold tracking .14em muted) and value + unit over a 6 px rounded bar on bg-inset. */
@Composable
fun WebTape(label: String, value: Double, unit: String, max: Double, tone: Color, modifier: Modifier = Modifier) {
    val pct = Math.max(0.0, Math.min(100.0, value / max * 100)).toFloat() / 100f
    Column(modifier) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            Text(label.uppercase(), color = Classic737Palette.Muted, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.14.em, maxLines = 1)
            Text("${Math.floor(value + 0.5).toLong()}$unit", color = Classic737Palette.Fg, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace, fontSize = 11.sp, maxLines = 1)
        }
        Box(Modifier.padding(top = 4.dp).fillMaxWidth().height(6.dp).background(Classic737Palette.Inset, RoundedCornerShape(50))) {
            Box(Modifier.fillMaxWidth(pct).height(6.dp).background(tone, RoundedCornerShape(50)))
        }
    }
}
