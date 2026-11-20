package com.oersted.trainer.sim

/**
 * Pure geometry / colour helpers of components/panel/IceRainDiagrams.tsx: the traced cockpit window outlines (AMM 56-10-0), the
 * front-view slat bands, the wing plan leading-edge line and the probe heat spots. The Compose drawings in
 * ui/cockpit/IceRainDiagramsView.kt call these and only add paint. All coordinates are the web SVG user units.
 */
object IceRainGeometry {
    private fun Pt(x: Double, y: Double): Pair<Double, Double> = Pair(x, y)

    /** Mirror axis of the front view (centre line x 2). */
    const val MX = 2329.0
    fun mir(p: List<Pair<Double, Double>>): List<Pair<Double, Double>> = p.map { Pt(MX - it.first, it.second) }

    /** Window outlines of the AIRCRAFT-RIGHT windows (viewer left), traced from the front view. */
    val WIN_R: Map<String, List<Pair<Double, Double>>> = mapOf(
        "1" to listOf(Pt(1093.0, 491.0), Pt(1160.0, 487.0), Pt(1160.0, 521.0), Pt(1092.0, 520.0)),
        "2" to listOf(Pt(1079.0, 492.0), Pt(1092.0, 493.0), Pt(1091.0, 525.0), Pt(1063.0, 538.0)),
        "3" to listOf(Pt(1048.0, 525.0), Pt(1062.0, 493.0), Pt(1072.0, 491.0), Pt(1060.0, 538.0)),
        "4" to listOf(Pt(1088.0, 479.0), Pt(1110.0, 474.0), Pt(1111.0, 483.0), Pt(1088.0, 486.0)),
        "5" to listOf(Pt(1065.0, 481.0), Pt(1085.0, 478.0), Pt(1086.0, 485.0), Pt(1066.0, 487.0)),
    )

    fun winPts(side: String, n: String): List<Pair<Double, Double>> = if (side == "R") WIN_R.getValue(n) else mir(WIN_R.getValue(n))
    fun centroid(p: List<Pair<Double, Double>>): Pair<Double, Double> = Pt(p.sumOf { it.first } / p.size, p.sumOf { it.second } / p.size)
    const val WIPER_LEN = 74.0

    private fun clamp(v: Double, lo: Double = 0.0, hi: Double = 1.0) = Math.min(hi, Math.max(lo, v))

    /** Window glass colour from temperature (web heatColor): amber at about 100 F shifting to red toward the 145 F cutoff. Returns (r, g, b). */
    fun heatRgb(t: Double): Triple<Int, Int, Int> {
        val k = clamp((t - 100) / 45)
        val g = Math.floor(150 - 100 * k + 0.5).toInt()
        return Triple(255, g, Math.floor(40 - 20 * k + 0.5).toInt())
    }

    /** Glow level of a window pane. */
    fun glow(t: Double): Double = clamp((t - 45) / 65)

    /** Vapour wisps drawn above a hot pane: 4 for No.1, 2 for No.2, 1 for No.4/5. */
    fun vaporLines(n: String): Int = if (n == "1") 4 else if (n == "2") 2 else 1

    // ---- front overview ----
    /** Wing top edge, viewer-left wing. */
    fun slatTop(x: Double): Double = 557 + (x - 100) * 0.0886
    fun slatBand(x0: Double, x1: Double, up: Double): List<Pair<Double, Double>> = listOf(
        Pt(x0, slatTop(x0) - 2 - up), Pt(x1, slatTop(x1) - 2 - up), Pt(x1, slatTop(x1) + 14), Pt(x0, slatTop(x0) + 14),
    )
    /** Slat band for a side: viewer-left wing = aircraft RIGHT. */
    fun frontSlatBand(side: String, ice: Double): List<Pair<Double, Double>> = if (side == "R") slatBand(110.0, 630.0, ice * 9) else mir(slatBand(110.0, 630.0, ice * 9))
    val ENG_CX: Map<String, Double> = mapOf("R" to 731.0, "L" to 1598.0)
    const val ENG_CY = 728.0

    // ---- wing plan ----
    /** Left-wing leading-edge line of the plan view: (298,140) to (55,195). */
    fun le(x: Double): Double = 140 + (298 - x) * (55.0 / 243)
    val SLATS: List<Pair<Double, Double>> = listOf(110.0 to 148.0, 150.0 to 188.0, 190.0 to 228.0)
    /** Mirror for the right wing in the plan view. */
    fun planX(side: String, x: Double): Double = if (side == "L") x else 640 - x

    // ---- probe heat spots on probe-heat-side-v2.jpg ----
    data class ProbeSpot(val ids: List<String>, val x: Double, val y: Double, val r: Double)
    val PROBE_XY: List<ProbeSpot> = listOf(
        ProbeSpot(listOf("capt"), 748.0, 592.0, 48.0),
        ProbeSpot(listOf("alphaL", "alphaR"), 826.0, 682.0, 38.0),
        ProbeSpot(listOf("fo"), 772.0, 748.0, 48.0),
        ProbeSpot(listOf("temp"), 915.0, 855.0, 36.0),
        ProbeSpot(listOf("elevL", "elevR"), 738.0, 116.0, 36.0),
        ProbeSpot(listOf("elevL", "elevR"), 1292.0, 213.0, 13.0),
    )
}
