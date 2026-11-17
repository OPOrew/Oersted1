package com.oersted.trainer.ui.overhead

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.oersted.trainer.sim.OverheadP5Rules
import com.oersted.trainer.ui.cockpit.CockpitModel
import kotlin.math.roundToInt

/*
 * Port of components/panel/OverheadP5.tsx (Overhead + OverheadP5): the interactive 737-200 forward overhead, a 1008 px wide design
 * canvas of five columns, an INDEX-TO-LOCK band with DOME WHITE, the main row and the landing-light / engine-start strip.
 * The web's IrsPanel and TransferPanel are defined there but not placed in the layout, so they are not ported.
 */

/** web zoom choices: FIT (to the width), 100 %, 150 % */
enum class OverheadZoom(val label: String, val factor: Float?) {
    FIT("FIT", null),
    X1("100%", 1f),
    X150("150%", 1.5f),
}

@Composable
private fun RowScope.GCol(w: Int, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.width(w.dp).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(4.dp), content = content)
}

/** web `Overhead`: the panel face at design size. */
@Composable
fun OverheadFace(p: P5) {
    val c = OverheadP5Rules.COLS
    val shape = RoundedCornerShape(10.dp)
    Column(
        Modifier.width(OverheadP5Rules.DESIGN_W.dp)
            .background(Color(0xFF55585C), shape).border(2.dp, Color(0xFF202225), shape)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        // top row
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            GCol(c[0]) { Blank(190); EltPanel(p); LeDevices(p, Modifier.weight(1f)) }
            GCol(c[1]) { CargoFirePanel(p, Modifier.weight(1f)) }
            GCol(c[2]) { ServiceInterphone(p, true) }
            GCol(c[3]) { AudioPanel(p); EnginePanel(p); OxygenRow(p, Modifier.weight(1f)) }
            GCol(c[4]) { RecorderPanel(p) }
        }
        // INDEX · TO LOCK band with DOME WHITE
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.width(c[0].dp).padding(start = 4.dp), contentAlignment = Alignment.CenterStart) { IndexLock() }
            Spacer(Modifier.width(c[1].dp))
            Box(Modifier.width(c[2].dp)) { DomeWhite(p) }
            Spacer(Modifier.width(c[3].dp))
            Box(Modifier.width(c[4].dp).padding(end = 4.dp), contentAlignment = Alignment.CenterEnd) { IndexLock() }
        }
        // main row
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            GCol(c[0]) { CompassPanel(p); FltCtrlPanel(p); FuelPanel(p, true) }
            GCol(c[1]) { MeterPanel(p); StandbyPanel(p); GenPanel(p, true) }
            GCol(c[2]) { CabinServicePanel(p, Modifier.weight(1f)) }
            GCol(c[3]) { IcePanel(p); HydDoorsCvr(p, true) }
            GCol(c[4]) { Blank(48); AirCondPanel(p); BleedPanel(p); PressPanel(p, true) }
        }
        BottomStrip(p)
    }
}

/** Lays [content] out at [designW] and draws it scaled by [scale] from the top-left, taking the scaled size in the layout. */
private fun Modifier.scaledDesign(designW: Dp, scale: Float): Modifier = this.layout { measurable, _ ->
    val wPx = designW.roundToPx()
    val placeable = measurable.measure(Constraints(minWidth = wPx, maxWidth = wPx, minHeight = 0, maxHeight = Constraints.Infinity))
    val w = (placeable.width * scale).roundToInt()
    val h = (placeable.height * scale).roundToInt()
    layout(w, h) {
        placeable.placeWithLayer(0, 0) {
            scaleX = scale
            scaleY = scale
            transformOrigin = TransformOrigin(0f, 0f)
        }
    }
}

/** web `OverheadP5` body: the face in a dark scroll well, scaled to FIT, 100 % or 150 %. The title and size buttons are in the cockpit tab's section. */
@Composable
fun OverheadP5(cockpit: CockpitModel, zoom: OverheadZoom, modifier: Modifier = Modifier) {
    val p = rememberP5(cockpit)
    val shape = RoundedCornerShape(8.dp)
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val fit = OverheadP5Rules.fitScale(maxWidth.value.toDouble()).toFloat()
        val scale = zoom.factor ?: fit
        Box(
            Modifier.fillMaxWidth().background(Color(0xFF121417), shape).border(1.dp, Color(0xFF343A42), shape)
                .padding(8.dp).horizontalScroll(rememberScrollState()),
        ) {
            Box(Modifier.scaledDesign(OverheadP5Rules.DESIGN_W.dp, scale)) { OverheadFace(p) }
        }
    }
}

/**
 * A cut-out of the real P5 forward overhead for the Training Console: the panels in [content] stacked in the column of design
 * width [OverheadP5Rules.COLS]`[col]`, scaled to the available width. The panels are the same composables the cockpit tab uses
 * (same switches, same patch + log notes), so there is one implementation of each control.
 */
@Composable
fun P5Cutout(cockpit: CockpitModel, col: Int, modifier: Modifier = Modifier, content: @Composable ColumnScope.(P5) -> Unit) {
    val p = rememberP5(cockpit)
    val w = OverheadP5Rules.COLS[col]
    val shape = RoundedCornerShape(6.dp)
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val scale = (maxWidth.value / (w + 12f)).coerceIn(0.5f, 1.8f)
        Box(Modifier.scaledDesign((w + 12).dp, scale)) {
            Column(
                Modifier.width((w + 12).dp).background(Color(0xFF55585C), shape).border(2.dp, Color(0xFF202225), shape).padding(6.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) { content(p) }
        }
    }
}

/** Like [P5Cutout] but at the full 1008 px width of the face (for the bottom strip). */
@Composable
fun P5WideCutout(cockpit: CockpitModel, modifier: Modifier = Modifier, content: @Composable ColumnScope.(P5) -> Unit) {
    val p = rememberP5(cockpit)
    val w = OverheadP5Rules.DESIGN_W
    val shape = RoundedCornerShape(6.dp)
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val scale = (maxWidth.value / w).coerceIn(0.2f, 1.8f)
        Box(Modifier.scaledDesign(w.dp, scale)) {
            Column(
                Modifier.width(w.dp).background(Color(0xFF55585C), shape).border(2.dp, Color(0xFF202225), shape).padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) { content(p) }
        }
    }
}
