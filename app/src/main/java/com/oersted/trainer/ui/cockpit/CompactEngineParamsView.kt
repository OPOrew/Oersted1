package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.ui.instruments.DialBand
import com.oersted.trainer.ui.instruments.RoundDial
import kotlin.math.max

/**
 * Port of `CompactEngineParams` in components/panel/EngineInstrumentPanel.tsx: for the given engine (1, 2 or both) a row of six 70 px
 * dials (EPR, N1, N2, EGT, FF in pph, OIL P) on a #1d2227 card. The web grid is 3 columns, 6 from the `sm` breakpoint (640).
 * Same band tables and constants as the web (KG_TO_LB 2.2046). Compose only; verify on a device.
 */
private val GreenBand = Color(0xFF2FC27A)
private val RedBand = Color(0xFFE24B4B)
private val AmberBand = Color(0xFFE0A84A)
private const val KG_TO_LB = 2.2046

private val N_BANDS = listOf(DialBand(0.0, 100.0, GreenBand), DialBand(100.0, 110.0, RedBand))
private val EGT_BANDS = listOf(DialBand(0.0, 620.0, GreenBand), DialBand(620.0, 700.0, AmberBand), DialBand(700.0, 900.0, RedBand))
private val OIL_BANDS = listOf(DialBand(0.0, 13.0, RedBand), DialBand(40.0, 90.0, GreenBand))

private fun jsRound(v: Double): Long = Math.floor(v + 0.5).toLong()

@Composable
fun CompactEngineParams(s: SimState, d: Derived, engine: Int? = null, modifier: Modifier = Modifier) {
    val sz = 70.dp
    fun pph(kg: Double) = max(0.0, kg) * KG_TO_LB
    @Composable
    fun row(n: Int) {
        val n1 = if (n == 1) s.n1_1 else s.n1_2
        val n2 = if (n == 1) s.n2_1 else s.n2_2
        val egt = if (n == 1) s.egt1 else s.egt2
        val ff = if (n == 1) s.ff1 else s.ff2
        val oil = if (n == 1) s.oilPsi1 else s.oilPsi2
        val epr = if (n == 1) d.epr1 else d.epr2
        Column {
            Text("ENGINE $n", color = Color(0xFFA9A08C), fontSize = 8.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.16.em, modifier = Modifier.padding(bottom = 4.dp))
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val cols = if (maxWidth >= 640.dp) 6 else 3
                val dials: List<@Composable () -> Unit> = listOf(
                    { RoundDial("EPR", epr, 1.0, 2.4, 0.4, minor = 2, digits = 2, size = sz, bands = listOf(DialBand(2.0, 2.4, RedBand))) },
                    { RoundDial("N1", n1, 0.0, 110.0, 20.0, minor = 2, scale = 10.0, size = sz, bands = N_BANDS, caption = "${jsRound(n1)}%") },
                    { RoundDial("N2", n2, 0.0, 110.0, 20.0, minor = 2, scale = 10.0, size = sz, bands = N_BANDS, caption = "${jsRound(n2)}%") },
                    { RoundDial("EGT", egt, 0.0, 900.0, 300.0, minor = 3, scale = 100.0, size = sz, bands = EGT_BANDS, caption = "${jsRound(egt)}°") },
                    { RoundDial("FF", pph(ff), 0.0, 5000.0, 1000.0, minor = 5, scale = 1000.0, size = sz, caption = "${jsRound(pph(ff))}") },
                    { RoundDial("OIL P", oil, 0.0, 100.0, 50.0, minor = 4, size = sz, bands = OIL_BANDS, caption = "${jsRound(oil)} psi") },
                )
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (chunk in dials.chunked(cols)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.Top) {
                            for (dial in chunk) dial()
                        }
                    }
                }
            }
        }
    }
    Column(
        modifier.fillMaxWidth().background(Color(0xFF1D2227), RoundedCornerShape(6.dp)).border(1.dp, Color(0xFF4A5057), RoundedCornerShape(6.dp)).padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (engine != 2) row(1)
        if (engine != 1) row(2)
    }
}
