package com.oersted.trainer.sim

/**
 * Tiny parser for the orthogonal SVG path strings used by the web schematics ("M262 43 V22 H14 V275 H36", several M subpaths allowed; letters may touch the numbers: "M262 43V22").
 * Only M / H / V with absolute numbers are supported (that is all PitotStaticDiagram uses). Returns one point list per subpath.
 */
object SvgLines {
    fun parse(d: String): List<List<Pair<Double, Double>>> {
        val out = ArrayList<MutableList<Pair<Double, Double>>>()
        val tok = Regex("[MHV]|-?\\d+(?:\\.\\d+)?").findAll(d).map { it.value }.toList()
        var i = 0
        var x = 0.0
        var y = 0.0
        var cur: MutableList<Pair<Double, Double>>? = null
        while (i < tok.size) {
            when (val c = tok[i]) {
                "M" -> { x = tok[i + 1].toDouble(); y = tok[i + 2].toDouble(); cur = mutableListOf(Pair(x, y)); out += cur; i += 3 }
                "H" -> { x = tok[i + 1].toDouble(); cur!!.add(Pair(x, y)); i += 2 }
                "V" -> { y = tok[i + 1].toDouble(); cur!!.add(Pair(x, y)); i += 2 }
                else -> error("unsupported path token $c")
            }
        }
        return out
    }
}
