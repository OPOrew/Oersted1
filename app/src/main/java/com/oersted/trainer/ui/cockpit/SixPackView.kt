package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.PitotStatic
import com.oersted.trainer.sim.SixPackData
import com.oersted.trainer.sim.SixPackGaugeRules
import com.oersted.trainer.ui.common.Classic737Palette
import com.oersted.trainer.ui.instruments.SixPackAirspeed
import com.oersted.trainer.ui.instruments.SixPackAltimeter
import com.oersted.trainer.ui.instruments.SixPackAttitude
import com.oersted.trainer.ui.instruments.SixPackHeading
import com.oersted.trainer.ui.instruments.SixPackTurnSlip
import com.oersted.trainer.ui.instruments.SixPackVerticalSpeed

/**
 * Port of `SixPack` / `SixPackSet` in components/panel/SixPack.tsx: the pitot / static note, then a Captain and a First officer card,
 * each with Airspeed, Attitude, Altimeter, Turn / Slip, Heading and Vertical speed gauges and the air-data status chip.
 * [sideBySide] puts the two cards in two columns, [foFirst] lists the First officer first, [hideNote] hides the note (web props).
 * Without [sideBySide] the cards sit side by side only from the web's `xl` breakpoint (1280 dp). The gauges are in
 * ui/instruments/SixPackGauges.kt; the feed (attitude, blanking of unpowered air data) is sim/SixPackData.kt.
 */
@Composable
fun SixPackView(cockpit: CockpitModel, sideBySide: Boolean = false, foFirst: Boolean = false, hideNote: Boolean = false) {
    val six by cockpit.sixPack.collectAsState()
    val air by cockpit.air.collectAsState()
    val wide = LocalConfiguration.current.screenWidthDp >= 1280
    val captCard: @Composable (Modifier) -> Unit = { mod ->
        SixPackSet(mod, "Captain six-pack", "CAPT", air.capt, six, six.captIasKt, six.captAltFt, six.captVsiFpm)
    }
    val foCard: @Composable (Modifier) -> Unit = { mod ->
        SixPackSet(mod, "First officer six-pack", "F/O", air.fo, six, six.foIasKt, six.foAltFt, six.foVsiFpm)
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (!hideNote) {
            Text(
                "PITOT/STATIC → PRIMARY FLIGHT INSTRUMENTS: CAPT AND F/O AIRSPEED, ALTIMETER AND VERTICAL-SPEED INDICATIONS USE THE LIVE ATA 34 AIR-DATA MODEL. " +
                    "THE MODELED ARCHITECTURE PROVIDES FOUR COMBINED PITOT/STATIC PROBES, INDEPENDENT CAPT/F/O NORMAL OR ALTERNATE STATIC SOURCES, AUXILIARY PITOT/STATIC " +
                    "SYSTEMS, AND PROBE ANTI-ICE/FAULT STATUS. ATTITUDE, TURN/SLIP AND HEADING RESPOND TO THE LIVE FLIGHT-ATTITUDE MODEL.",
                color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 9.sp, letterSpacing = 0.08.em, lineHeight = 13.sp,
                modifier = Modifier.fillMaxWidth().background(MaterialInset(), RoundedCornerShape(8.dp)).border(1.dp, Classic737Palette.Border, RoundedCornerShape(8.dp)).padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
        if (sideBySide || wide) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                if (foFirst) { foCard(Modifier.weight(1f)); captCard(Modifier.weight(1f)) } else { captCard(Modifier.weight(1f)); foCard(Modifier.weight(1f)) }
            }
        } else {
            if (foFirst) { foCard(Modifier); captCard(Modifier) } else { captCard(Modifier); foCard(Modifier) }
        }
    }
}

private fun MaterialInset() = Color(0xFF0E1116)

@Composable
private fun SixPackSet(
    modifier: Modifier, title: String, side: String, data: PitotStatic.SideAirData, six: SixPackData,
    iasKt: Double, altFt: Double, vsiFpm: Double,
) {
    val flags = data.flags
    val shape = RoundedCornerShape(12.dp)
    val three = LocalConfiguration.current.screenWidthDp >= 640
    Column(modifier.fillMaxWidth().background(Color(0xFF1A1E23), shape).border(1.dp, Color(0xFF454C55), shape).padding(12.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f, fill = false)) {
                Text("$side FLIGHT INSTRUMENTS", color = Classic737Palette.Subtle, fontSize = 10.sp, letterSpacing = 0.18.em)
                Text(title, color = Classic737Palette.Fg, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            }
            val warn = flags.isNotEmpty()
            Text(
                SixPackGaugeRules.status(flags).uppercase(), fontFamily = FontFamily.Monospace, fontSize = 8.sp,
                color = if (warn) Color(0xFFFCD34D) else Color(0xFF6EE7B7),
                modifier = Modifier.weight(1f, fill = false).padding(start = 8.dp)
                    .background(if (warn) Color(0x33451A03) else Color(0x33022C22), RoundedCornerShape(4.dp))
                    .border(1.dp, if (warn) Color(0x80F59E0B) else Color(0x6610B981), RoundedCornerShape(4.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
        val gauges: List<@Composable (Modifier) -> Unit> = listOf(
            { m -> SixPackAirspeed(iasKt, data.pitotOk, m) },
            { m -> SixPackAttitude(six.roll, six.pitch, m) },
            { m -> SixPackAltimeter(altFt, data.staticOk, m) },
            { m -> SixPackTurnSlip(six.yawRate, m) },
            { m -> SixPackHeading(six.heading, m) },
            { m -> SixPackVerticalSpeed(vsiFpm, data.staticOk, m) },
        )
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (row in gauges.chunked(if (three) 3 else 2)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (g in row) Box(Modifier.weight(1f)) { g(Modifier) }
                }
            }
        }
    }
}
