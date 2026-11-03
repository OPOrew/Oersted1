package com.oersted.trainer.sim

import com.oersted.trainer.sim.AutoFlight.GsPhase
import com.oersted.trainer.sim.AutoFlight.LatSub
import com.oersted.trainer.sim.RadioNav.RadioNavData
import com.oersted.trainer.sim.Situation.ExplainIn
import com.oersted.trainer.sim.Situation.SituationHolder
import com.oersted.trainer.sim.Situation.SituationSample
import com.oersted.trainer.sim.Situation.Publisher
import com.oersted.trainer.sim.Situation.Tone
import com.oersted.trainer.sim.Situation.explain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SituationTest {
    private val nav = RadioNavData(
        vorValid = false, locValid = true, gsValid = true, radial = 0.0, locDev = 0.5, gsErr = 0.0,
        vorDist = 0.0, thrDist = 8.0,
    )

    private fun sample(
        flying: Boolean = true,
        alt: Double = 3000.0,
        latSub: LatSub = LatSub.OFF,
        gsPhase: GsPhase = GsPhase.OFF,
        gsCapT: Double = 0.0,
        hdg: Double = 62.0,
    ) = SituationSample(
        x = 0.0, y = 0.0, hdg = hdg, altFt = alt, tasKt = 150.0, flying = flying,
        latSub = latSub, gsPhase = gsPhase, gsCapT = gsCapT,
    )

    private fun input(
        sit: SituationSample = sample(),
        navOn: Boolean = false,
        apAil: Boolean = false,
        apElev: Boolean = false,
        apWhy: String = "",
        apNav: Int = 0,
        apPitch: Int = 1,
        selCrs: Double = 62.0,
        navValid: Boolean = true,
    ) = ExplainIn(
        sit = sit, navOn = navOn, tuned = "ILS", nav = nav, navValid = navValid, selCrs = selCrs, selHdg = 58.0,
        apNav = apNav, apHdgSw = 1, apAil = apAil, apElev = apElev, apPitch = apPitch, apWhy = apWhy, vorDev = 0.0,
    )

    @Test fun notAirborneGivesNothing() {
        val e = explain(input(sit = sample(flying = false, alt = 100.0)))
        assertTrue(e.lateral.isEmpty() && e.vertical.isEmpty())
    }

    @Test fun offStateExplainsManualFlying() {
        val e = explain(input())
        assertEquals(1, e.lateral.size)
        assertEquals(Tone.INFO, e.lateral[0].tone)
        assertTrue(e.lateral[0].text.startsWith("Autopilot is OFF."))
    }

    @Test fun disconnectReasonStripsPrefix() {
        val e = explain(input(apWhy = "A/P disconnect: DC power lost"))
        assertTrue(e.lateral[0].text.contains("because: DC power lost."))
        assertTrue(!e.lateral[0].text.contains("A/P disconnect"))
    }

    @Test fun localizerDeviationReadsInDots() {
        val e = explain(input(navOn = true, apNav = 1, apAil = true, apElev = true))
        assertTrue(e.lateral[0].text.contains("You are 0.5° (1.0 dots) left of the localizer."))
    }

    @Test fun courseWarningWhenFarFromRunwayCourse() {
        val e = explain(input(navOn = true, selCrs = 40.0, apNav = 1, apAil = true, apElev = true))
        assertTrue(e.lateral.any { it.tone == Tone.WARN && it.text.contains("Course selector reads 040°") })
    }

    @Test fun glideSlopeCaptureShowsElapsedTime() {
        val e = explain(input(sit = sample(gsPhase = GsPhase.CAPTURE, gsCapT = 3.0), apAil = true, apElev = true))
        assertTrue(e.vertical.any { it.text.contains("(3/10 s)") && it.tone == Tone.OK })
    }

    @Test fun altHoldRoundsAltitude() {
        val e = explain(input(sit = sample(alt = 3000.4), apAil = true, apElev = true, apPitch = 2))
        assertTrue(e.vertical.any { it.text == "ALT HOLD: holding about 3000 ft." })
    }

    @Test fun publisherThrottlesToTenHz() {
        val holder = SituationHolder()
        val pub = Publisher(holder)
        assertTrue(!pub.publishThrottled(sample(), 50.0)) // first 100 ms blocked (lastPublishMs starts at 0)
        assertTrue(pub.publishThrottled(sample(), 150.0))
        assertTrue(!pub.publishThrottled(sample(), 200.0))
        assertTrue(pub.publishThrottled(sample(), 260.0))
    }

    @Test fun trailOnlyGrowsWhenMoved() {
        val holder = SituationHolder()
        holder.publish(sample().copy(x = 1.0, y = 1.0))
        holder.publish(sample().copy(x = 1.01, y = 1.0)) // under 0.03 nm: no new point
        holder.publish(sample().copy(x = 2.0, y = 1.0))
        assertEquals(2, holder.state.trail.size)
        holder.clearTrail()
        assertTrue(holder.state.trail.isEmpty())
    }
}
