package com.oersted.trainer.sim

/**
 * Port of the logic in NavAutopilotDiagram.tsx: the navigation (ATA 34) + autopilot / flight director (ATA 22) component-flow schematic, left to
 * right: sensors and power -> source selectors -> captain / first-officer sources -> FD-108 + SP-77 (+ glareshield controls) -> instruments, servos,
 * surfaces, attitude model. Everything is coloured from the live model, so a failed gyro / compass / VHF NAV, a lost bus or hydraulic system B, a dropped
 * engage interlock or a missing radio signal shows on the line and box it affects. The flight director and autopilot run from the CAPTAIN's selected sources.
 * [build] returns the drawable model (nodes, chips, edges and their states); the Compose canvas only paints it.
 */
object NavAutopilotDiagramRules {
    const val GREEN = 0xFF3DD68CL
    const val GREY = 0xFF4A5560L
    const val RED = 0xFFE24B4BL
    const val AMBER = 0xFFE0A84AL
    const val TXT = 0xFFAAB3BCL
    const val BOX = 0xFF12171CL
    const val FAINT = 0xFF8D8A7CL
    const val VBW = 880
    const val VBH = 626

    enum class St { OK, IDLE, FAIL, WARN }

    fun colorOf(st: St): Long = when (st) { St.OK -> GREEN; St.IDLE -> GREY; St.FAIL -> RED; St.WARN -> AMBER }

    data class Box(val x: Int, val y: Int, val w: Int, val h: Int)

    /** TS N: node boxes by id (declaration order matters only for the node draw order, which [build] fixes explicitly). */
    val N: Map<String, Box> = mapOf(
        "stn" to Box(10, 14, 128, 36), "nav1" to Box(10, 62, 128, 36), "nav2" to Box(10, 104, 128, 36),
        "comp1" to Box(10, 160, 128, 36), "comp2" to Box(10, 202, 128, 36),
        "gyro1" to Box(10, 258, 128, 36), "gyro2" to Box(10, 300, 128, 36), "gyroaux" to Box(10, 342, 128, 36),
        "air" to Box(10, 440, 128, 36), "ra" to Box(10, 482, 128, 36), "dc" to Box(10, 538, 128, 36), "hyd" to Box(10, 580, 128, 36),
        "navsel" to Box(185, 62, 118, 78), "compsel" to Box(185, 160, 118, 78), "gyrosel" to Box(185, 279, 118, 78),
        "csrc" to Box(350, 70, 122, 130), "fsrc" to Box(350, 240, 122, 130),
        "fd" to Box(520, 60, 150, 86), "ap" to Box(520, 166, 150, 200), "ctl" to Box(520, 386, 150, 62),
        "ci" to Box(720, 40, 150, 170), "fi" to Box(720, 225, 150, 110),
        "servo" to Box(720, 370, 150, 56), "surf" to Box(720, 444, 150, 50), "att" to Box(720, 512, 150, 70),
    )

    private val NAV_DIM = setOf("air", "ra", "dc", "hyd", "servo", "surf", "att", "ap", "fd", "ctl")
    private val AP_DIM = setOf("fsrc", "fi")

    val NAV_NAME = listOf("MAN", "VOR LOC", "AUTO APP", "MAN G/S")
    val PITCH_NAME = listOf("TURB", "OFF", "ALT HOLD")
    val FD_NAME = listOf("GA", "OFF", "HDG", "VOR/LOC", "AUTO APPR")
    val NAV_SEL = listOf("BOTH ON 1", "NORMAL", "BOTH ON 2")
    val GYRO_SEL = listOf("CAPT ON AUX", "NORMAL", "F/O ON AUX")
    val INSTR_LINES = listOf("ADI · FD bars · G/S", "HSI · CRS / HDG / DEV", "RMI · DME", "ASI · ALT · VSI", "HEIGHT (radio alt)")

    data class Chip(val x: Int, val y: Int, val w: Int, val label: String, val st: St)
    /** Free text drawn inside a node (SVG <text> with explicit position / colour / size). */
    data class Txt(val x: Int, val y: Int, val color: Long, val size: Double, val bold: Boolean, val text: String)
    data class NodeV(val id: String, val title: String, val st: St, val lines: List<String>, val chips: List<Chip>, val texts: List<Txt>, val dim: Boolean) {
        val box: Box get() = N.getValue(id)
    }
    data class EdgeV(val a: String, val b: String, val d: String, val st: St, val dim: Boolean)
    data class Model(val nodes: List<NodeV>, val edges: List<EdgeV>)

    private fun <T> list(i: Int, l: List<T>, def: T): T = l.getOrNull(i) ?: def

    fun title(focus: String?): String = when (focus) {
        "nav" -> "navigation (ATA 34)"
        "ap" -> "autopilot / flight director (ATA 22)"
        else -> "navigation + autopilot"
    }

    fun build(s: SimState, d: Derived, m: MipLocal.MipState, focus: String?): Model {
        val pw = d.dcPower
        val hydB = d.hydB >= 1500
        val src = Sources.sourcesOf(Sources.SourceSelect(m.navSel, m.compSel, m.gyroSel), m.srcFail)
        val c = src.capt
        val f = src.fo
        val air = PitotStatic.computeAirData(s, d.dcPower, d.acPower)
        val airOk = pw && air.capt.staticOk
        val raOk = pw && !m.fail.ht
        val attBad = m.fail.att || c.att
        val hdgBad = m.fail.hdg || c.hdg
        val navBadC = m.fail.loc || c.nav
        val navBadF = m.fail.loc || f.nav
        val il = pw && hydB && !attBad && !hdgBad
        val ailOn = m.apAil && il
        val elevOn = m.apElev && il
        val apOn = ailOn || elevOn
        val signal = m.navOn && (if (m.navTuned == "ILS") m.nav.locValid else m.nav.vorValid)
        fun powered(ok: Boolean = true): St = if (!pw) St.IDLE else if (ok) St.OK else St.FAIL
        fun radio(failed: Boolean): St = if (failed) St.FAIL else if (m.navOn) St.OK else St.IDLE

        class Sensor(val st: St, val txt: String)
        val sf = m.srcFail
        val sensor = mapOf(
            "stn" to Sensor(if (m.navOn) St.OK else St.IDLE, if (m.navOn) "TUNED ${m.navTuned} · ${if (signal) "SIGNAL" else "NO SIGNAL"}" else "STATION OFF"),
            "nav1" to Sensor(radio(sf.nav1), if (sf.nav1) "FAILED" else if (m.navOn) "RECEIVING" else "STANDBY"),
            "nav2" to Sensor(radio(sf.nav2), if (sf.nav2) "FAILED" else if (m.navOn) "RECEIVING" else "STANDBY"),
            "comp1" to Sensor(powered(!sf.comp1), if (sf.comp1) "FAILED" else if (pw) "HDG VALID" else "NO POWER"),
            "comp2" to Sensor(powered(!sf.comp2), if (sf.comp2) "FAILED" else if (pw) "HDG VALID" else "NO POWER"),
            "gyro1" to Sensor(powered(!sf.gyro1), if (sf.gyro1) "FAILED" else if (pw) "ATT VALID" else "NO POWER"),
            "gyro2" to Sensor(powered(!sf.gyro2), if (sf.gyro2) "FAILED" else if (pw) "ATT VALID" else "NO POWER"),
            "gyroaux" to Sensor(powered(!sf.gyroAux), if (sf.gyroAux) "FAILED" else if (pw) "ATT VALID" else "NO POWER"),
            "air" to Sensor(if (airOk) St.OK else if (pw) St.FAIL else St.IDLE, if (airOk) "${RunwaySceneRules.jsRound(air.capt.altFt)} FT · ${RunwaySceneRules.jsRound(air.capt.iasKt)} KT" else if (pw) "STATIC FAULT" else "NO POWER"),
            "ra" to Sensor(if (raOk) St.OK else if (pw) St.FAIL else St.IDLE, if (raOk) "VALID" else if (pw) "FAILED" else "NO POWER"),
            "dc" to Sensor(if (pw) St.OK else St.FAIL, if (pw) "AVAILABLE" else "LOST"),
            "hyd" to Sensor(if (hydB) St.OK else St.FAIL, if (hydB) "PRESSURE OK" else "NO PRESSURE"),
        )
        fun srcSt(bad: Boolean, nav: Boolean): St = if (bad) St.FAIL else if (nav) (if (m.navOn) St.OK else St.IDLE) else powered()

        val dimSet = when (focus) { "nav" -> NAV_DIM; "ap" -> AP_DIM; else -> emptySet() }
        fun dim(id: String) = id in dimSet

        /* route helpers: elbow from the right edge of a to the left edge of b, vertical leg at xm */
        fun rp(a: Box, b: Box, xm: Int, ya: Int? = null, yb: Int? = null): String {
            val x1 = a.x + a.w; val y1 = ya ?: (a.y + a.h / 2); val x2 = b.x; val y2 = yb ?: (b.y + b.h / 2)
            return "M$x1 $y1 H$xm V$y2 H$x2"
        }
        val edges = ArrayList<EdgeV>()
        fun e(a: String, b: String, d: String, st: St) { edges += EdgeV(a, b, d, st, dim(a) || dim(b)) }
        fun nb(id: String) = N.getValue(id)

        e("stn", "nav1", "M10 32 H3 V80 H10", sensor.getValue("stn").st)
        e("stn", "nav2", "M3 56 V122 H10", sensor.getValue("stn").st)
        e("nav1", "navsel", rp(nb("nav1"), nb("navsel"), 160, 80, nb("navsel").y + 22), sensor.getValue("nav1").st)
        e("nav2", "navsel", rp(nb("nav2"), nb("navsel"), 166, 122, nb("navsel").y + 56), sensor.getValue("nav2").st)
        e("comp1", "compsel", rp(nb("comp1"), nb("compsel"), 160, 178, nb("compsel").y + 22), sensor.getValue("comp1").st)
        e("comp2", "compsel", rp(nb("comp2"), nb("compsel"), 166, 220, nb("compsel").y + 56), sensor.getValue("comp2").st)
        e("gyro1", "gyrosel", rp(nb("gyro1"), nb("gyrosel"), 156, 276, nb("gyrosel").y + 18), sensor.getValue("gyro1").st)
        e("gyro2", "gyrosel", rp(nb("gyro2"), nb("gyrosel"), 163, 318, nb("gyrosel").y + 39), sensor.getValue("gyro2").st)
        e("gyroaux", "gyrosel", rp(nb("gyroaux"), nb("gyrosel"), 170, 360, nb("gyrosel").y + 60), sensor.getValue("gyroaux").st)

        fun chipY(box: Box, i: Int) = box.y + 34 + i * 30 + 9
        class Sel(val id: String, val i: Int, val nav: Boolean, val badC: Boolean, val badF: Boolean)
        val sels = listOf(
            Sel("navsel", 0, true, navBadC, navBadF), Sel("compsel", 1, false, hdgBad, m.fail.hdg || f.hdg), Sel("gyrosel", 2, false, attBad, m.fail.att || f.att),
        )
        sels.forEachIndexed { k, sl ->
            val b = nb(sl.id)
            e(sl.id, "csrc", rp(b, nb("csrc"), 312 + k * 7, b.y + 26, chipY(nb("csrc"), sl.i)), srcSt(sl.badC, sl.nav))
            e(sl.id, "fsrc", rp(b, nb("fsrc"), 340 - k * 7, b.y + 52, chipY(nb("fsrc"), sl.i)), srcSt(sl.badF, sl.nav))
        }

        val capSrcOk: St = if (attBad || hdgBad) St.FAIL else powered()
        e("csrc", "fd", rp(nb("csrc"), nb("fd"), 480, 135, nb("fd").y + 40), capSrcOk)
        e("csrc", "ap", rp(nb("csrc"), nb("ap"), 486, 160, nb("ap").y + 30), capSrcOk)
        e("csrc", "ci", "M411 70 V26 H716 V70 H720", capSrcOk)
        e("fsrc", "fi", "M411 370 V453 H708 V280 H720", if (f.att || f.hdg || m.fail.att || m.fail.hdg) St.FAIL else powered())

        e("air", "ap", rp(nb("air"), nb("ap"), 492, 458, nb("ap").y + 70), if (airOk) St.OK else St.IDLE)
        e("ra", "ap", rp(nb("ra"), nb("ap"), 498, 500, nb("ap").y + 100), if (raOk) St.OK else St.IDLE)
        e("dc", "ap", rp(nb("dc"), nb("ap"), 504, 556, nb("ap").y + 130), if (pw) St.OK else St.FAIL)
        e("air", "ci", rp(nb("air"), nb("ci"), 688, 458, nb("ci").y + 110), if (airOk) St.OK else St.IDLE)
        e("ra", "ci", rp(nb("ra"), nb("ci"), 694, 500, nb("ci").y + 140), if (raOk) St.OK else St.IDLE)
        e("ctl", "fd", "M520 417 H510 V${nb("fd").y + 66} H520", St.OK)
        e("ctl", "ap", "M595 386 V366", St.OK)
        e("fd", "ci", rp(nb("fd"), nb("ci"), 678, nb("fd").y + 43, nb("ci").y + 85), if (m.fdCmd.show) St.OK else St.IDLE)
        e("ap", "servo", rp(nb("ap"), nb("servo"), 684, nb("ap").y + 100, nb("servo").y + 18), if (m.apWarn) St.WARN else if (apOn) St.OK else St.IDLE)
        e("hyd", "servo", rp(nb("hyd"), nb("servo"), 700, 598, nb("servo").y + 40), if (hydB) St.OK else St.FAIL)
        e("servo", "surf", "M795 426 V444", if (apOn) St.OK else St.IDLE)
        e("surf", "att", "M795 494 V512", if (apOn) St.OK else St.IDLE)
        e("att", "ci", "M720 547 H714 V${nb("ci").y + 160} H720", if (pw) St.OK else St.IDLE)
        e("att", "fi", "M714 300 H720", if (pw) St.OK else St.IDLE)

        val nodes = ArrayList<NodeV>()
        fun node(id: String, title: String, st: St, lines: List<String> = emptyList(), chips: List<Chip> = emptyList(), texts: List<Txt> = emptyList()) {
            nodes += NodeV(id, title, st, lines, chips, texts, dim(id))
        }
        fun sensorNode(id: String, title: String) = node(id, title, sensor.getValue(id).st, listOf(sensor.getValue(id).txt))
        sensorNode("stn", "VOR / ILS STATION"); sensorNode("nav1", "VHF NAV 1"); sensorNode("nav2", "VHF NAV 2")
        sensorNode("comp1", "COMPASS 1"); sensorNode("comp2", "COMPASS 2")
        sensorNode("gyro1", "VERT GYRO 1"); sensorNode("gyro2", "VERT GYRO 2"); sensorNode("gyroaux", "VERT GYRO AUX")
        sensorNode("air", "CAPT AIR DATA"); sensorNode("ra", "RADIO ALTIMETER"); sensorNode("dc", "DC POWER"); sensorNode("hyd", "HYDRAULIC SYS B")

        node("navsel", "VHF NAV SEL", St.OK, listOf("POSITION", list(m.navSel, NAV_SEL, "NORMAL")))
        node("compsel", "COMPASS SEL", St.OK, listOf("POSITION", list(m.compSel, NAV_SEL, "NORMAL")))
        node("gyrosel", "VERT GYRO SEL", St.OK, listOf("POSITION", list(m.gyroSel, GYRO_SEL, "NORMAL")))

        fun srcBox(id: String, title: String, navBad: Boolean, hdg: Boolean, att: Boolean) {
            val b = nb(id)
            val sts = listOf("NAV" to srcSt(navBad, true), "HDG" to srcSt(hdg, false), "ATT" to srcSt(att, false))
            node(id, title, if (sts.any { it.second == St.FAIL }) St.WARN else if (pw) St.OK else St.IDLE, chips = sts.mapIndexed { i, (l, st) -> Chip(b.x + 14, b.y + 34 + i * 30, 94, l, st) })
        }
        srcBox("csrc", "CAPTAIN SOURCES", navBadC, hdgBad, attBad)
        srcBox("fsrc", "F/O SOURCES", navBadF, m.fail.hdg || f.hdg, m.fail.att || f.att)

        node("fd", "FLT DIR FD-108", if (pw) (if (m.fdMode != 1) St.OK else St.IDLE) else St.IDLE,
            listOf("MODE ${list(m.fdMode, FD_NAME, "OFF")}${if (m.fdAlt) " · ALT" else ""}", if (m.fdCmd.show) "BARS SHOWN" else "BARS OUT OF VIEW"))
        val ap = nb("ap")
        val radioNoSig = m.apNav != 0 && !signal
        node("ap", "AUTOPILOT SP-77", if (m.apWarn) St.WARN else if (apOn) St.OK else St.IDLE,
            listOf("AIL ${if (ailOn) "ENGAGED" else "OFF"}", "ELEV ${if (elevOn) "ENGAGED" else "OFF"}", "NAV ${list(m.apNav, NAV_NAME, "MAN")}", "PITCH ${list(m.apPitch, PITCH_NAME, "OFF")}"),
            chips = listOf("DC" to pw, "HYD B" to hydB, "ATT" to !attBad, "HDG" to !hdgBad).mapIndexed { i, (l, ok) -> Chip(ap.x + 8 + i * 35, ap.y + 94, 32, l, if (ok) St.OK else St.FAIL) },
            texts = buildList {
                add(Txt(ap.x + 8, ap.y + 128, FAINT, 8.5, false, "engage interlocks"))
                add(Txt(ap.x + 8, ap.y + 144, if (radioNoSig) AMBER else FAINT, 8.5, false, if (radioNoSig) "radio mode: no signal" else "uses CAPT sources"))
                if (m.apWarn) add(Txt(ap.x + 8, ap.y + 186, AMBER, 9.5, true, "A/P DISCONNECT WARNING"))
            })
        node("ctl", "GLARESHIELD", St.OK, listOf("CRS · HDG · NAV", "PITCH · FD mode"))

        node("ci", "CAPT INSTRUMENTS", if (pw) (if (attBad || hdgBad || navBadC) St.WARN else St.OK) else St.IDLE, INSTR_LINES)
        node("fi", "F/O INSTRUMENTS", if (pw) (if (m.fail.att || f.att || m.fail.hdg || f.hdg || navBadF) St.WARN else St.OK) else St.IDLE, INSTR_LINES.take(4))
        node("servo", "A/P SERVOS", if (m.apWarn) St.WARN else if (apOn) St.OK else St.IDLE, listOf("AIL · ELEV", "ROLL ${if (ailOn) "ON" else "OFF"} · PITCH ${if (elevOn) "ON" else "OFF"}"))
        node("surf", "AILERON / ELEVATOR", if (apOn) St.OK else St.IDLE, listOf("hydraulic B"))
        node("att", "ATTITUDE MODEL", if (pw) St.OK else St.IDLE, listOf("pitch · roll · hdg", "position vs VOR/ILS"))
        return Model(nodes, edges)
    }
}
