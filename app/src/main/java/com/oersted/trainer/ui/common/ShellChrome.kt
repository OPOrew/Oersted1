@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.oersted.trainer.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.SimState

/** Colors from the web styles.css tokens (@theme for dark, html.light-mode for light). */
object Classic737Palette {
    val Bg = Color(0xFF0A0C0E)
    val Surface = Color(0xFF12151A)
    val Panel = Color(0xFF181C24)
    val Raised = Color(0xFF222833)
    val Inset = Color(0xFF0E1116)
    val Fg = Color(0xFFE7E2D6)
    val Muted = Color(0xFF8D929C)
    val Subtle = Color(0xFF5C616C)
    val Border = Color(0xFF2C323D)
    val Accent = Color(0xFF8BA4B8)
    val AccentFg = Color(0xFF0A0C0E)
    val Ok = Color(0xFF3DD68C)
    val Caution = Color(0xFFE0A84A)
    val Warn = Color(0xFFE24B4B)
    val Pneumatic = Color(0xFFD4A574)
    val HydA = Color(0xFF5B8FD4)
    val HydB = Color(0xFF3DD68C)
    val Elec = Color(0xFF7EC8E3)
}

/** Light-mode values from html.light-mode in styles.css. */
private object Classic737LightPalette {
    val Bg = Color(0xFFF3F5F7)
    val Surface = Color(0xFFFFFFFF)
    val Panel = Color(0xFFE8EDF1)
    val Raised = Color(0xFFDCE3E8)
    val Fg = Color(0xFF18212A)
    val Muted = Color(0xFF56616C)
    val Border = Color(0xFFB9C3CC)
    val Accent = Color(0xFF496B86)
    val AccentFg = Color(0xFFFFFFFF)
}

fun classic737Scheme(light: Boolean): ColorScheme =
    if (light) {
        lightColorScheme(
            background = Classic737LightPalette.Bg,
            surface = Classic737LightPalette.Surface,
            surfaceVariant = Classic737LightPalette.Panel,
            surfaceContainerHighest = Classic737LightPalette.Raised,
            onBackground = Classic737LightPalette.Fg,
            onSurface = Classic737LightPalette.Fg,
            onSurfaceVariant = Classic737LightPalette.Muted,
            primary = Classic737LightPalette.Accent,
            onPrimary = Classic737LightPalette.AccentFg,
            outline = Classic737LightPalette.Border,
        )
    } else {
        darkColorScheme(
            background = Classic737Palette.Bg,
            surface = Classic737Palette.Surface,
            surfaceVariant = Classic737Palette.Panel,
            surfaceContainerHighest = Classic737Palette.Raised,
            onBackground = Classic737Palette.Fg,
            onSurface = Classic737Palette.Fg,
            onSurfaceVariant = Classic737Palette.Muted,
            primary = Classic737Palette.Accent,
            onPrimary = Classic737Palette.AccentFg,
            outline = Classic737Palette.Border,
        )
    }

/** Semantic tones of the web tokens; light mode swaps them for the html.light-mode values (styles.css). */
class ShellTones(val ok: Color, val caution: Color, val warn: Color, val pneumatic: Color, val hydA: Color, val hydB: Color, val elec: Color, val line: Color, val inset: Color)

@Composable
fun shellTones(): ShellTones =
    if (MaterialTheme.colorScheme.background.luminance() > 0.5f) {
        ShellTones(Color(0xFF168653), Color(0xFF9A6508), Color(0xFFB32626), Color(0xFF95662F), Color(0xFF3269A8), Color(0xFF168653), Color(0xFF287E9D), Color(0xFF98A6B2), Color(0xFFEEF1F4))
    } else {
        ShellTones(Classic737Palette.Ok, Classic737Palette.Caution, Classic737Palette.Warn, Classic737Palette.Pneumatic, Classic737Palette.HydA, Classic737Palette.HydB, Classic737Palette.Elec, Color(0xFF3A4150), Classic737Palette.Inset)
    }

class ShellNavItem(val label: String, val icon: ShellIconKind)

/** AppShell header (`border-b border-border bg-surface/95`): logo, title + subtitle, theme button, and the md+ top navigation. */
@Composable
fun ShellHeader(
    title: String,
    subtitle: String,
    lightMode: Boolean,
    onToggleTheme: () -> Unit,
    items: List<ShellNavItem>,
    selected: Int,
    onSelect: (Int) -> Unit,
    content: @Composable () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val border = scheme.outline.copy(alpha = 0.5f)
    BoxWithConstraints(Modifier.fillMaxWidth().background(scheme.surface.copy(alpha = 0.95f))) {
        val sm = maxWidth >= 640.dp
        val md = maxWidth >= 768.dp
        Column(Modifier.statusBarsPadding()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = if (sm) 16.dp else 8.dp, vertical = if (sm) 12.dp else 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(if (sm) 12.dp else 8.dp),
            ) {
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(36.dp).background(scheme.surfaceVariant.copy(alpha = 0.4f), RoundedCornerShape(6.dp)).border(1.dp, border, RoundedCornerShape(6.dp)), contentAlignment = Alignment.Center) {
                        ShellIcon(ShellIconKind.GAUGE, scheme.primary)
                    }
                    Column(Modifier.weight(1f, fill = false)) {
                        Text(title, color = scheme.onSurface, fontSize = if (sm) 18.sp else 16.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.06.em, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(subtitle.uppercase(), color = Classic737Palette.Subtle, fontSize = if (sm) 11.sp else 10.sp, letterSpacing = 0.18.em, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                ShellButton(
                    if (sm) (if (lightMode) "Dark" else "Light") else "", ShellBtn.OUTLINE,
                    icon = if (lightMode) ShellIconKind.MOON else ShellIconKind.SUN, onClick = onToggleTheme,
                )
                if (md) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        items.forEachIndexed { i, item ->
                            val on = i == selected
                            val shape = RoundedCornerShape(6.dp)
                            Row(
                                Modifier.height(40.dp).then(if (on) Modifier.background(scheme.surfaceContainerHighest, shape) else Modifier).clickable { onSelect(i) }.padding(horizontal = 12.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                ShellIcon(item.icon, if (on) scheme.onSurface else scheme.onSurfaceVariant)
                                Text(item.label.uppercase(), color = if (on) scheme.onSurface else scheme.onSurfaceVariant, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.12.em)
                            }
                        }
                    }
                }
            }
            content()
        }
        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(1.dp).background(border))
    }
}

/** AppShell bottom navigation (below md): five equal cells, 16dp icon over a 10sp uppercase label, active `text-fg`, else `text-muted`. */
@Composable
fun ShellBottomNav(items: List<ShellNavItem>, selected: Int, onSelect: (Int) -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().background(scheme.surface.copy(alpha = 0.95f)).navigationBarsPadding()) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(scheme.outline.copy(alpha = 0.5f)))
        Row(Modifier.fillMaxWidth()) {
            items.forEachIndexed { i, item ->
                val ink = if (i == selected) scheme.onSurface else scheme.onSurfaceVariant
                Column(
                    Modifier.weight(1f).heightIn(min = 56.dp).clickable { onSelect(i) },
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
                ) {
                    ShellIcon(item.icon, ink)
                    Text(item.label.uppercase(), color = ink, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.14.em, maxLines = 1, textAlign = TextAlign.Center)
                }
            }
        }
    }
}

enum class ShellBtn { GHOST, SECONDARY, OUTLINE }

/** web Button size="sm": ghost, secondary (raised) and outline variants, optional leading icon. */
@Composable
fun ShellButton(text: String, variant: ShellBtn, icon: ShellIconKind? = null, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(8.dp)
    val bg = when (variant) { ShellBtn.SECONDARY -> scheme.surfaceVariant; else -> Color.Transparent }
    val bd = when (variant) { ShellBtn.OUTLINE -> scheme.outline.copy(alpha = 0.6f); ShellBtn.SECONDARY -> scheme.surfaceVariant; else -> Color.Transparent }
    Row(
        Modifier.heightIn(min = 36.dp).background(bg, shape).border(1.dp, bd, shape).clickable(onClick = onClick).padding(horizontal = if (text.isEmpty()) 10.dp else 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (icon != null) ShellIcon(icon, scheme.onSurface)
        if (text.isNotEmpty()) Text(text, color = scheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

/** Web StatusStrip: `border-t border-border bg-inset/80`, wrapped caption lights and tapes, buttons right-aligned. N2 tapes show from sm, hydraulics from md. */
@Composable
fun StatusStrip(
    s: SimState,
    d: Derived,
    onTimeScale: () -> Unit,
    onReadyApu: () -> Unit,
    onColdAndDark: () -> Unit,
) {
    val tones = shellTones()
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val sm = maxWidth >= 640.dp
        val md = maxWidth >= 768.dp
        Column(Modifier.fillMaxWidth().background(tones.inset.copy(alpha = 0.8f))) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)))
            FlowRow(
                Modifier.fillMaxWidth().padding(horizontal = if (sm) 16.dp else 8.dp, vertical = if (sm) 8.dp else 6.dp),
                horizontalArrangement = Arrangement.spacedBy(if (sm) 16.dp else 8.dp),
                verticalArrangement = Arrangement.spacedBy(if (sm) 8.dp else 6.dp),
            ) {
                CaptionLight("MASTER CAUTION", d.masterCaution, tones.caution)
                CaptionLight("FIRE", d.fireWarn, tones.warn)
                CaptionLight(if (s.wow) "GND" else "AIR", s.battery, tones.elec)
                Tape("APU", s.apuRpm, "%", 100.0, tones.ok)
                if (sm) {
                    Tape("N2-1", s.n2_1, "%", 100.0, tones.caution)
                    Tape("N2-2", s.n2_2, "%", 100.0, tones.caution)
                }
                Tape("DUCT", d.ductPsi, "psi", 50.0, tones.pneumatic)
                if (md) {
                    Tape("HYD A", s.hydAPress, "psi", 3000.0, tones.hydA)
                    Tape("HYD B", s.hydBPress, "psi", 3000.0, tones.hydB)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ShellButton("${s.timeScale.toInt()}× time", ShellBtn.GHOST, onClick = onTimeScale)
                    ShellButton("Set APU running", ShellBtn.SECONDARY, onClick = onReadyApu)
                    ShellButton("Cold & dark", ShellBtn.OUTLINE, onClick = onColdAndDark)
                }
            }
        }
    }
}

/** web CaptionLight: `min-h-8 min-w-[4.5rem] rounded-[3px] border px-1.5 py-1`, lit = tone fill with glow, unlit = `border-line bg-inset text-subtle/80`. */
@Composable
fun CaptionLight(label: String, on: Boolean, tone: Color) {
    val tones = shellTones()
    val shape = RoundedCornerShape(3.dp)
    val light = MaterialTheme.colorScheme.background.luminance() > 0.5f
    val litText = if (tone == tones.warn) MaterialTheme.colorScheme.onSurface else if (light) Color.White else Classic737Palette.AccentFg
    Box(
        Modifier.heightIn(min = 32.dp).widthIn(min = 72.dp)
            .then(if (on) Modifier.shadow(10.dp, shape, ambientColor = tone, spotColor = tone).background(tone, shape) else Modifier.background(tones.inset, shape).border(1.dp, tones.line, shape))
            .padding(horizontal = 6.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (on) litText else Classic737Palette.Subtle.copy(alpha = 0.8f), fontSize = 10.sp, fontWeight = FontWeight.SemiBold, lineHeight = 12.sp, textAlign = TextAlign.Center)
    }
}

/** web Tape: label (10sp uppercase muted) and mono value + unit above a 6dp rounded bar filled value / max. */
@Composable
fun Tape(label: String, value: Double, unit: String, max: Double, tone: Color) {
    val scheme = MaterialTheme.colorScheme
    val pct = (value / max).coerceIn(0.0, 1.0).toFloat()
    Column(Modifier.widthIn(min = 77.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            Text(label.uppercase(), color = scheme.onSurfaceVariant, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.14.em)
            Row(Modifier.padding(start = 8.dp)) {
                Text("${Math.round(value)}", color = scheme.onSurface, fontFamily = FontFamily.Monospace, fontSize = 11.sp)
                Text(unit, color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 11.sp, modifier = Modifier.padding(start = 2.dp))
            }
        }
        Box(Modifier.padding(top = 4.dp).fillMaxWidth().height(6.dp).background(shellTonesInset(), CircleShape)) {
            Box(Modifier.fillMaxWidth(pct).height(6.dp).background(tone, CircleShape))
        }
    }
}

@Composable
private fun shellTonesInset(): Color = shellTones().inset
