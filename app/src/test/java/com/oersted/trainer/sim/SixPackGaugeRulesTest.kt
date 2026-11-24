package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SixPackGaugeRulesTest {
    private val G = SixPackGaugeRules

    @Test fun airspeedDial() {
        assertEquals(-150.0, G.airspeedAngle(0.0), 1e-9)
        assertEquals(0.0, G.airspeedAngle(200.0), 1e-9)
        assertEquals(150.0, G.airspeedAngle(400.0), 1e-9)
        assertEquals(150.0, G.airspeedPointer(900.0), 1e-9)
        assertEquals(-150.0, G.airspeedPointer(-5.0), 1e-9)
        assertEquals("000", G.iasText(0.4)); assertEquals("007", G.iasText(6.6)); assertEquals("250", G.iasText(249.5)); assertEquals("1000", G.iasText(1000.0))
    }

    @Test fun verticalSpeedDial() {
        assertEquals(-90.0, G.vsAngle(0.0), 1e-9)
        assertEquals(-2.0, G.vsAngle(6000.0), 1e-9)
        assertEquals(-178.0, G.vsAngle(-6000.0), 1e-9)
        assertEquals(-46.0, G.vsAngle(1500.0), 1e-9)
        assertEquals(-2.0, G.vsPointer(9000.0), 1e-9)
        assertEquals("+1500", G.vsText(1500.4)); assertEquals("0", G.vsText(0.4)); assertEquals("-500", G.vsText(-500.0)); assertEquals("0", G.vsText(-0.4))
        assertEquals("+6000", G.vsText(7000.0))
        assertTrue(G.vsBig(0)); assertTrue(G.vsBig(1500)); assertFalse(G.vsBig(500)); assertFalse(G.vsBig(Int.MIN_VALUE + 1))
        assertEquals(listOf("0", "1", "1.5", "2", "4", "6"), listOf(0, 1000, 1500, 2000, 4000, 6000).map { G.vsLabel(it) })
    }

    @Test fun altimeterHands() {
        assertEquals(180.0, G.altHundredsDeg(1500.0), 1e-9)
        assertEquals(180.0, G.altTenKDeg(15000.0), 1e-9)
        assertEquals(270.0, G.altHundredsDeg(-250.0), 1e-9)
        assertEquals(G.altHundredsDeg(-1000.0), G.altHundredsDeg(-5000.0), 1e-9)
        assertEquals("12,346", G.altText(12345.6)); assertEquals("-1,000", G.altText(-4000.0)); assertEquals("0", G.altText(0.2))
    }

    @Test fun headingCard() {
        assertEquals(350.0, G.normHeading(-10.0), 1e-9)
        assertEquals("005°", G.headingText(5.2)); assertEquals("360°", G.headingText(359.6)); assertEquals("350°", G.headingText(-10.0))
        assertEquals(listOf("N", "3", "6", "E", "12", "S", "W", "33"), listOf(0, 30, 60, 90, 120, 180, 270, 330).map { G.headingLabel(it) })
    }

    @Test fun attitudeGeometry() {
        assertEquals(190.0, G.ladderY(-30), 1e-9); assertEquals(70.0, G.ladderY(10), 1e-9); assertEquals(115.0, G.ladderY(-5), 1e-9)
        assertEquals(18.0, G.ladderHalfWidth(-10), 0.0); assertEquals(24.0, G.ladderHalfWidth(20), 0.0); assertEquals(30.0, G.ladderHalfWidth(-30), 0.0)
        assertEquals(listOf(false, true, false, false, true, false), G.PITCH_MARKS.map { G.ladderLabelled(it) })
        assertEquals(78.0, G.rollTickInner(0), 0.0); assertEquals(82.0, G.rollTickInner(10), 0.0)
        assertEquals(listOf(2.2, 1.2, 2.2, 1.2, 1.2, 2.2, 1.2, 1.2, 2.2, 1.2, 2.2), G.ROLL_MARKS.map { G.rollTickWidth(it) })
    }

    @Test fun turnAndSlip() {
        assertEquals(20.0, G.turnNeedle(3.0), 1e-9)
        assertEquals(-40.0, G.turnNeedle(-12.0), 1e-9)
        assertEquals(40.0, G.turnNeedle(50.0), 1e-9)
        assertEquals(6.6, G.turnBall(3.0), 1e-9)
        assertEquals(26.4, G.turnBall(12.0), 1e-9)
        assertEquals(-26.4, G.turnBall(-50.0), 1e-9)
    }

    @Test fun statusChip() {
        assertEquals("NORMAL AIR DATA", G.status(emptyList()))
        assertEquals("PITOT · ALT STATIC", G.status(listOf("PITOT", "ALT STATIC")))
    }
}
