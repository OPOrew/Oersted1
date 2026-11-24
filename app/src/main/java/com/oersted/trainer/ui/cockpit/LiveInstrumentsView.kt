package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.MainPanelRules as R
import com.oersted.trainer.sim.PedestalTopDeckRules
import com.oersted.trainer.sim.RadioNav
import com.oersted.trainer.ui.common.Classic737Palette
import com.oersted.trainer.ui.instruments.AdiFace
import com.oersted.trainer.ui.instruments.AltFace
import com.oersted.trainer.ui.instruments.AsiFace
import com.oersted.trainer.ui.instruments.DialBand
import com.oersted.trainer.ui.instruments.FlapDial
import com.oersted.trainer.ui.instruments.GearPair
import com.oersted.trainer.ui.instruments.HsiFace
import com.oersted.trainer.ui.instruments.RmiFace
import com.oersted.trainer.ui.instruments.RoundDial
import com.oersted.trainer.ui.instruments.SixPackVerticalSpeed
import com.oersted.trainer.ui.instruments.adiNavFrom

/**
 * Port of components/panel/LiveInstruments.tsx, shared by the Autopilot and Navigation tabs (the flight-phase readout shows these
 * instead of text values): [InstrumentStrip] = the captain's ADI / HSI / RMI / airspeed / altimeter / vertical speed fed exactly like the
 * main panel (useCaptainFeeds), [SystemsCluster] = flap dial, gear lights, EPR 1 / EPR 2 dials, speedbrake and autopilot text.
 * Grids follow the web breakpoints (3 / 6 columns and 2 / 4 columns at 640 dp). Compose only; verified on CI.
 */
private val CellLine = Color(0xFF2A2F36)
private val CellBg = Color(0xFF0B0D10)
private val EprRed = Color(0xFFD65A4A)

/** web Cell: instrument in a `max-w-[210px]` bordered tile of [aspect], caption under it. */
@Composable
private fun InstrCell(label: String, aspect: Float, modifier: Modifier, content: @Composable () -> Unit) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.widthIn(max = 210.dp).fillMaxWidth().aspectRatio(aspect).clip(RoundedCornerShape(4.dp)).background(CellBg).border(1.dp, CellLine, RoundedCornerShape(4.dp)),
        ) { content() }
        Text(label.uppercase(), color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 2.dp).fillMaxWidth())
    }
}

@Composable
fun InstrumentStrip(cockpit: CockpitModel) {
    val sim by cockpit.simState.collectAsState()
    val d by cockpit.derived.collectAsState()
    val m by cockpit.mipState.collectAsState()
    val air by cockpit.air.collectAsState()
    val ped by cockpit.pedestalState.collectAsState()
    val pw = d.dcPower
    val capt = air.capt
    val captPowered = capt.adc.data.powered
    val disp = R.display(sim.navXfr, sim.efiXfr, m.navSel, m.compSel, m.gyroSel)
    val src = R.sources(disp, sim.irsXfr, m.srcFail)
    val failC = R.failCapt(m.fail, src, m.srcPower, m.attCapt, disp)
    val navC = if (failC.loc) RadioNav.NO_NAV else m.nav
    val tas = R.tasKt(capt.iasKt, capt.altFt)
    val gs = R.gsKt(sim.wow, sim.groundSpeedKt, tas)
    val slip = R.clamp(sim.rudderPedal, -1.0, 1.0)
    val ils = m.navOn && m.navTuned == "ILS"
    val nav = adiNavFrom(ils, if (ils && navC.locValid) navC.locDev else null, if (ils && navC.gsValid) navC.gsErr else null)
    fun rmiBrg(sel: Int, adf: Double?) = R.rmiBearing(sel, m.navOn, navC.vorValid, navC.radial, m.attCapt.hdg, adf)

    val cells: List<Pair<String, @Composable (Modifier) -> Unit>> = listOf(
        "ADI" to { mod ->
            InstrCell("ADI", 242f / 254f, mod) {
                AdiFace(powered = pw, test = pw && m.adiTestCapt, fail = failC, pitch = m.attCapt.pitch, roll = m.attCapt.roll, slip = slip, fd = m.fdCmd, nav = nav, modifier = Modifier.fillMaxSize())
            }
        },
        "HSI" to { mod ->
            InstrCell("HSI", 232f / 202f, mod) {
                HsiFace(pw, failC, m.attCapt.hdg, tas, gs, m.selCrs, m.selHdg, navC, m.navOn, m.navTuned)
            }
        },
        "RMI" to { mod ->
            InstrCell("RMI", 154f / 176f, mod) {
                RmiFace(
                    pw, failC, m.attCapt.hdg,
                    R.dmeDisplayNm(0, failC.dme1, m.dmeCh), R.dmeDisplayNm(1, failC.dme2, m.dmeCh),
                    rmiBrg(ped.rmiNeedle1.first, m.adfBrg1), rmiBrg(ped.rmiNeedle2.first, m.adfBrg2),
                )
            }
        },
        "Airspeed" to { mod -> InstrCell("Airspeed", 1f, mod) { AsiFace(capt, captPowered, m.bugCapt) } },
        "Altimeter" to { mod -> InstrCell("Altimeter", 1f, mod) { AltFace(capt.altFt, captPowered, sim.psBaroCaptHpa, sim.psBaroCaptHpa / R.HPA_PER_INHG) } },
        "Vertical speed" to { mod -> InstrCell("Vertical speed", 1f, mod) { SixPackVerticalSpeed(capt.vsiFpm, capt.staticOk) } },
    )
    val per = if (LocalConfiguration.current.screenWidthDp >= 640) 6 else 3
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (row in cells.chunked(per)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                for ((_, cell) in row) cell(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun ClusterBox(modifier: Modifier, content: @Composable () -> Unit) {
    Column(
        modifier.background(Classic737Palette.Inset, RoundedCornerShape(4.dp)).border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp)).padding(6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}

@Composable
private fun ClusterCaption(text: String) =
    Text(text.uppercase(), color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 2.dp).fillMaxWidth())

/** Flaps, gear, thrust (EPR), speedbrake and autopilot state: the real indicators, not numbers. */
@Composable
fun SystemsCluster(cockpit: CockpitModel) {
    val s by cockpit.simState.collectAsState()
    val d by cockpit.derived.collectAsState()
    val m by cockpit.mipState.collectAsState()
    val gl = d.gearLights
    val test = s.ltTest && d.dcPower
    val spoilerPct = Math.floor(Math.max(0.0, Math.min(1.0, s.spoilerPos)) * 100 + 0.5).toLong()
    val apOn = m.apAil || m.apElev
    val apText = if (apOn) "ARMED · " + listOfNotNull(if (m.apAil) "AIL" else null, if (m.apElev) "ELEV" else null).joinToString(" + ") else "UNARMED"

    val boxes: List<@Composable (Modifier) -> Unit> = listOf(
        { mod ->
            ClusterBox(mod) {
                Box(Modifier.widthIn(max = 110.dp).fillMaxWidth().aspectRatio(1f).clip(CircleShape).background(Color(0xFF050607)).padding(4.dp)) { FlapDial(s.flapPos, Modifier.fillMaxSize()) }
                ClusterCaption("Flap position")
            }
        },
        { mod ->
            ClusterBox(mod) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    GearPair("NOSE GEAR", test || gl.nose.red, test || gl.nose.green)
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        GearPair("LEFT GEAR", test || gl.leftMain.red, test || gl.leftMain.green)
                        GearPair("RIGHT GEAR", test || gl.rightMain.red, test || gl.rightMain.green)
                    }
                }
                ClusterCaption("Gear lights · red transit · green down & locked")
            }
        },
        { mod ->
            ClusterBox(mod) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    RoundDial("EPR 1", d.epr1, 1.0, 2.4, 0.4, minor = 2, digits = 2, size = 78.dp, caption = PedestalTopDeckRules.toFixed(d.epr1, 2), bands = listOf(DialBand(2.0, 2.4, EprRed)))
                    RoundDial("EPR 2", d.epr2, 1.0, 2.4, 0.4, minor = 2, digits = 2, size = 78.dp, caption = PedestalTopDeckRules.toFixed(d.epr2, 2), bands = listOf(DialBand(2.0, 2.4, EprRed)))
                }
                ClusterCaption("Thrust · EPR")
            }
        },
        { mod ->
            Column(mod, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TextBox("Speedbrake (actual)", "${s.speedBrake.ifEmpty { "-" }} · spoilers $spoilerPct%".uppercase(), Classic737Palette.Fg)
                TextBox("Autopilot", apText, if (apOn) Color(0xFF6EE7B7) else Classic737Palette.Fg)
            }
        },
    )
    val per = if (LocalConfiguration.current.screenWidthDp >= 640) 4 else 2
    Column(Modifier.fillMaxWidth().padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (row in boxes.chunked(per)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                for (b in row) b(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun TextBox(label: String, value: String, valueColor: Color) {
    Column(Modifier.fillMaxWidth().background(Classic737Palette.Inset, RoundedCornerShape(4.dp)).border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 4.dp)) {
        Text(label.uppercase(), color = Classic737Palette.Subtle, fontSize = 7.sp, letterSpacing = 0.12.em)
        Text(value, color = valueColor, fontFamily = FontFamily.Monospace, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
