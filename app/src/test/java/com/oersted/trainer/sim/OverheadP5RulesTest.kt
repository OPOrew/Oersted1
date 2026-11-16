package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** P5 forward overhead rules (OverheadP5.tsx). */
class OverheadP5RulesTest {
    private val R = OverheadP5Rules

    @Test
    fun switchGeometry() {
        assertEquals(34, R.vSwitchHeight(3, true))
        assertEquals(54, R.vSwitchHeight(3, false))
        assertEquals(42, R.vSwitchHeight(2, false))
        assertEquals(66, R.hSwitchWidth(3))
        assertEquals(46, R.hSwitchWidth(2))
        assertEquals(0, R.switchIndex(listOf("OFF", "ON"), "X"))
        assertEquals(1, R.switchIndex(listOf("OFF", "ON"), "ON"))
        assertEquals(0, R.switchPick(-0.2, 3))
        assertEquals(1, R.switchPick(0.5, 3))
        assertEquals(2, R.switchPick(1.0, 3))
        assertEquals(15.0, R.vHandleHeight(54, 3), 0.0)
        assertEquals(2.0, R.vHandleTop(54, 3, 0), 0.0)
        assertEquals(2 + 2 * (50.0 / 3), R.vHandleTop(54, 3, 2), 1.0e-9)
        assertEquals(19.0, R.hHandleWidth(66, 3), 0.0)
        assertEquals(2 + 22.0 * 0, R.hHandleLeft(66, 3, 0), 0.0)
    }

    @Test
    fun gaugeGeometry() {
        assertEquals(0.0, R.gaugeFraction(-5.0, 0.0, 10.0), 0.0)
        assertEquals(0.5, R.gaugeFraction(5.0, 0.0, 10.0), 0.0)
        assertEquals(1.0, R.gaugeFraction(99.0, 0.0, 10.0), 0.0)
        assertEquals(0.0, R.gaugeFraction(3.0, 3.0, 3.0), 0.0)
        assertEquals(-118.0, R.gaugeAngle(0.0), 0.0)
        assertEquals(118.0, R.gaugeAngle(1.0), 0.0)
        val (x, y) = R.gaugePoint(0.0, 33.0)
        assertEquals(50.0, x, 1.0e-9)
        assertEquals(21.0, y, 1.0e-9)
        val (x2, y2) = R.gaugePoint(90.0, 10.0, 50.0)
        assertEquals(60.0, x2, 1.0e-9)
        assertEquals(50.0, y2, 1.0e-9)
        assertEquals(-120.0, R.mixDialAngle(-1.0), 0.0)
        assertEquals(0.0, R.mixDialAngle(0.5), 0.0)
        assertEquals(120.0, R.mixDialAngle(2.0), 0.0)
        assertEquals(-118.0, R.gaugeTickAngle(0, 5), 0.0)
        assertEquals(118.0, R.gaugeTickAngle(4, 5), 0.0)
        assertEquals(-118.0, R.gaugeTickAngle(0, 1), 0.0)
        assertEquals(160.0, R.gaugeTickValue(4, 5, 40.0, 160.0), 0.0)
        assertEquals(100.0, R.gaugeTickValue(2, 5, 40.0, 160.0), 0.0)
    }

    @Test
    fun gaugeScaleText() {
        assertEquals(listOf("0", "2", "4", "6", "8", "10"), R.gaugeNums("APU EGT", 0.0, 10.0, 5))
        assertEquals(listOf("0", "200", "400", "600", "800"), R.gaugeNums(" EGT  °C ", 0.0, 800.0, 4))
        assertEquals(listOf("-4", "-2", "0", "2", "4"), R.gaugeNums("CABIN CLIMB", -4.0, 4.0, 4))
        // JS Math.round: -1.5 -> -1, 0 -> 0, 1.5 -> 2
        assertEquals(listOf("-1", "0", "2"), R.gaugeNums("X", -1.5, 1.5, 2))
        assertEquals(listOf("0", "1", "2"), R.gaugeNums("X", 0.0, 2.0, 2))
        assertEquals("EGT", R.gaugeUnit("APU EGT", null))
        assertEquals("PSI", R.gaugeUnit("TANK 1 FUEL °C", "PSI"))
        assertEquals("", R.gaugeUnit("Q", null))
        assertEquals("", R.gaugeSubLine("APU EGT", "EGT"))
        // no preset: the sub text is the unit, so no second line (web `sub !== cfg.unit`)
        assertEquals("", R.gaugeSubLine("GEN DRIVE OIL TEMP °C", "RISE 0–30 · IN 40–160"))
        assertEquals("RISE 0–30 · IN 40–160", R.gaugeUnit("GEN DRIVE OIL TEMP °C", "RISE 0–30 · IN 40–160"))
        assertEquals("X", R.gaugeSubLine("APU EGT", "X"))
        assertEquals("AC AMPS", R.gaugeTitle("  AC\n AMPS "))
    }

    @Test
    fun irsDisplay() {
        assertEquals("", R.irsLeft(false, "123", "PPOS"))
        assertEquals("N 5109.32", R.irsLeft(true, "", "PPOS"))
        assertEquals("123", R.irsLeft(true, "123", "PPOS"))
        assertEquals("888888", R.irsLeft(true, "123", "TEST"))
        assertEquals("", R.irsRight(false, "PPOS"))
        assertEquals("W 00315.17", R.irsRight(true, "PPOS"))
        assertEquals("270/ 35", R.irsRight(true, "WIND"))
        assertEquals("090/ 000", R.irsRight(true, "TK/GS"))
        assertEquals("OK", R.irsRight(true, "HDG/STS"))
        assertEquals("888888", R.irsRight(true, "TEST"))
        assertEquals("12", R.irsKey("1", "2"))
        assertEquals("23456789", R.irsKey("2345678", "9"))
        assertEquals("34567890", R.irsKey("23456789", "0"))
        assertEquals("", R.irsKey("55", "CLR"))
        assertEquals("55", R.irsKey("55", "ENT"))
        assertEquals("3456789A", R.irsKey("23456789", "A"))
        assertTrue(R.irsAligning(true, true, "ALIGN", 0.4))
        assertFalse(R.irsAligning(true, true, "ALIGN", 1.0))
        assertFalse(R.irsAligning(true, false, "ALIGN", 0.4))
        assertFalse(R.irsAligning(true, true, "NAV", 0.4))
        assertEquals(40L, R.irsAlignPercent(0.4))
        assertEquals(listOf("TEST", "TK/GS", "PPOS", "WIND", "HDG/STS"), R.DSPL_TICKS)
    }

    @Test
    fun leDevices() {
        assertTrue(R.leExt(true, false, true))
        assertFalse(R.leExt(false, true, true))
        assertTrue(R.leTransit(true, true, false))
        assertFalse(R.leTransit(true, true, true))
    }

    @Test
    fun meterSources() {
        val trOn = listOf(true, false, true)
        assertTrue(R.meterDcSource(0, "AUTO", false, trOn))
        assertFalse(R.meterDcSource(0, "OFF", true, trOn))
        assertTrue(R.meterDcSource(2, "OFF", true, trOn))
        assertFalse(R.meterDcSource(1, "OFF", false, trOn))
        assertTrue(R.meterDcSource(3, "OFF", false, trOn))
        assertFalse(R.meterDcSource(4, "OFF", false, trOn))
        assertTrue(R.meterDcSource(6, "OFF", false, trOn))
        assertTrue(R.meterAcSource(0, "AUTO", true, false, false, false, false, false, 0.0))
        assertFalse(R.meterAcSource(0, "AUTO", false, false, false, false, false, false, 0.0))
        assertTrue(R.meterAcSource(1, "OFF", true, true, true, false, false, false, 0.0))
        assertFalse(R.meterAcSource(1, "OFF", true, true, false, false, false, false, 0.0))
        assertTrue(R.meterAcSource(2, "OFF", true, false, false, true, false, false, 0.0))
        assertTrue(R.meterAcSource(3, "OFF", true, false, false, false, false, true, 91.0))
        assertFalse(R.meterAcSource(3, "OFF", true, false, false, false, false, true, 90.0))
        assertTrue(R.meterAcSource(4, "OFF", true, false, false, false, true, false, 0.0))
        assertTrue(R.meterAcSource(5, "OFF", true, false, false, false, false, false, 0.0))
        assertEquals(18.0, R.meterDcAmps(true, true, 3), 0.0)
        assertEquals(0.0, R.meterDcAmps(true, true, 2), 0.0)
        assertEquals(28.0, R.meterDcVolts(true, 4), 0.0)
        assertEquals(24.0, R.meterDcVolts(true, 2), 0.0)
        assertEquals(0.0, R.meterDcVolts(false, 4), 0.0)
        assertEquals(400.0, R.meterFreq(true), 0.0)
        assertEquals(380.0, R.meterFreq(false), 0.0)
        assertEquals(115.0, R.meterAcVolts(true), 0.0)
        assertEquals(100.0, R.meterAcVolts(false), 0.0)
    }

    @Test
    fun genDriveRules() {
        assertEquals(40.0, R.genDriveShown(70.0, true), 0.0)
        assertEquals(60.0, R.genDriveShown(90.0, true), 0.0)
        assertEquals(70.0, R.genDriveShown(70.0, false), 0.0)
        assertEquals("BAT", R.standbyPowerPosition("BAT"))
        assertEquals("OFF", R.standbyPowerPosition("XXX"))
        assertNull(R.driveResetBlockedNote(1, false, false, 0.0)) // disconnecting is always allowed
        assertNull(R.driveResetBlockedNote(1, true, true, 3.0))
        assertEquals(
            "GEN 2 DRIVE RESET INHIBITED — WEIGHT OFF WHEELS; RESET ONLY ON GROUND AFTER ENGINE SHUTDOWN (AMM 24-11).",
            R.driveResetBlockedNote(2, true, false, 0.0),
        )
        assertEquals(
            "GEN 1 DRIVE RESET INHIBITED — ENGINE N2 23% — NOT SHUT DOWN; RESET ONLY ON GROUND AFTER ENGINE SHUTDOWN (AMM 24-11).",
            R.driveResetBlockedNote(1, true, true, 22.5),
        )
        assertNotNull(R.driveToggleNote(1, true))
        assertEquals("GEN 2 DRIVE RESET ON GROUND AFTER ENGINE SHUTDOWN", R.driveToggleNote(2, false))
    }

    @Test
    fun flightControlRules() {
        assertEquals("ON", R.fltCtrlPosition(true, "ON"))
        assertEquals("STBY RUD", R.fltCtrlPosition(false, "ON"))
        assertEquals("OFF", R.fltCtrlPosition(false, "OFF"))
        assertTrue(R.stbyLowQuantity(true, 19.0))
        assertFalse(R.stbyLowQuantity(true, 20.0))
        assertTrue(R.stbyLowPressure(true, "AUTO", false))
        assertFalse(R.stbyLowPressure(true, "OFF", false))
        assertFalse(R.stbyLowPressure(true, "ON", true))
        assertEquals(60L, R.fuelHeatSeconds(0.0))
        assertEquals(1L, R.fuelHeatSeconds(59.2))
        assertEquals(0L, R.fuelHeatSeconds(75.0))
    }

    @Test
    fun cabinRules() {
        assertEquals("MANUAL_COOL", R.tempMode("MANUAL"))
        assertEquals("AUTO", R.tempMode(null))
        assertEquals("MANUAL_WARM", R.tempMode("MANUAL_WARM"))
        assertEquals(1, R.tempModeIndex("AUTO"))
        assertEquals(0, R.tempModeIndex("???"))
        assertEquals("AUTO", R.tempModeLabel("AUTO"))
        assertEquals("MANUAL", R.tempModeLabel("MANUAL_WARM"))
        assertEquals(75.0, R.tempSelectOrDefault(null), 0.0)
        assertEquals(15.0, R.ductTempC(false, 80.0), 0.0)
        assertEquals(0.0, R.ductTempC(true, 32.0), 0.0)
        assertEquals(2, R.wiperIndex("LOW", 1))
        assertEquals(3, R.wiperIndex("HIGH", 0))
        assertEquals(1, R.wiperIndex("PARK", 1))
        assertEquals("PARK", R.wiperMode(1))
        assertEquals("LOW", R.wiperMode(2))
        assertEquals("HIGH", R.wiperMode(3))
        assertEquals("WIPERS PARK", R.wiperNote(0))
        assertEquals("WIPERS HIGH", R.wiperNote(3))
    }

    @Test
    fun pressurizationRules() {
        assertEquals("MAN AC", R.pressModeLabel("MAN_AC"))
        assertEquals("MAN DC", R.pressModeLabel("MAN_DC"))
        assertEquals("AUTO", R.pressModeLabel("AUTO"))
        assertEquals("MAN_AC", R.pressModeFromLabel("MAN AC"))
        assertEquals("STBY", R.pressModeFromLabel("STBY"))
        assertTrue(R.pressManual("MAN_DC"))
        assertFalse(R.pressManual("AUTO"))
        assertEquals("-----", R.readout2("00200", false))
        assertEquals("00200", R.readout2("00200", true))
        assertEquals("00200", R.pad5(200))
        assertEquals("39000", R.pad5(39000))
        assertEquals("+0.5", R.cabinRateText(0.5))
        assertEquals("0.0", R.cabinRateText(0.0))
        assertEquals("-0.3", R.cabinRateText(-0.3))
        assertEquals(30.0, R.cabinBarPercent(true, 10.0), 0.0)
        assertEquals(100.0, R.cabinBarPercent(true, 50.0), 0.0)
        assertEquals(0.0, R.cabinBarPercent(false, 10.0), 0.0)
        assertEquals(100.0, R.fltAltBarPercent(true, 41000.0), 1.0e-9)
        assertEquals(0.0, R.fltAltBarPercent(false, 41000.0), 0.0)
        assertEquals(8.0, R.outflowValue(true), 0.0)
        assertEquals(2.0, R.outflowValue(false), 0.0)
    }

    @Test
    fun bottomStripRules() {
        assertEquals(0, R.startIndex("GRD"))
        assertEquals(2, R.startIndex("IGN_L"))
        assertEquals(4, R.startIndex("FLT"))
        assertEquals(1, R.startIndex("weird"))
        assertEquals("IGN_R", R.startValue(3.0))
        assertEquals("FLT", R.startValue(9.0))
        assertEquals("ENG 2 START → L IGN", R.startNote(2, 2.0))
        assertEquals("OFF", R.positionLights(true, false))
        assertEquals("STROBE_STEADY", R.positionLights(true, true))
        assertEquals("STEADY", R.positionLights(false, true))
    }

    @Test
    fun cargoAndAudioAndEngine() {
        assertTrue(R.cargoCanDischarge(true, true, false))
        assertFalse(R.cargoCanDischarge(false, true, false))
        assertFalse(R.cargoCanDischarge(true, false, false))
        assertFalse(R.cargoCanDischarge(true, true, true))
        assertEquals("CARGO FIRE DISCH — agent released into the FWD compartment.", R.cargoDischargeNote("FWD"))
        assertEquals("", R.audioTxToggle("VHF-1", "VHF-1"))
        assertEquals("VHF-2", R.audioTxToggle("VHF-1", "VHF-2"))
        assertTrue(R.audioTxLit("PA", "PA", true))
        assertFalse(R.audioTxLit("PA", "PA", false))
        assertEquals(8, R.RX.size)
        assertEquals(6, R.AUD2.size)
        assertTrue(R.reverserLit(true, false, true))
        assertFalse(R.reverserLit(false, true, true))
        assertTrue(R.pmcOnLit(true, true))
        assertTrue(R.pmcInopLit(true, false, false))
        assertTrue(R.pmcInopLit(true, true, true))
        assertFalse(R.pmcInopLit(false, false, true))
        assertTrue(R.lowIdleLit(true, false, true))
        assertEquals(1.0, R.compassStep(0.0, 1.0), 0.0)
        assertEquals(359.0, R.compassStep(0.0, -2.0), 0.0)
        assertEquals(10.0, R.compassStep(10.0, 0.0), 0.0)
    }

    @Test
    fun iceHydraulicsAndFit() {
        assertEquals("WINDOW HEAT LSide ON", R.windowHeatNote("windowHeatLSide", true))
        assertEquals("WINDOW HEAT RFwd OFF", R.windowHeatNote("windowHeatRFwd", false))
        assertEquals("AFT CARGO DOOR CLOSED", R.doorNote("AFT CARGO", true))
        assertEquals("FWD ENTRY DOOR OPEN", R.doorNote("FWD ENTRY", false))
        assertTrue(R.cvrEraseAllowed(true, true, false))
        assertFalse(R.cvrEraseAllowed(false, true, false))
        assertFalse(R.cvrEraseAllowed(true, false, false))
        assertFalse(R.cvrEraseAllowed(true, true, true))
        assertTrue(R.windowOnLit(true, true, false, "OFF"))
        assertFalse(R.windowOnLit(true, true, true, "OFF"))
        assertTrue(R.windowOnLit(true, false, false, "PWR"))
        assertFalse(R.windowOnLit(false, true, false, "PWR"))
        assertTrue(R.windowOvhtLit(true, false, "OVHT"))
        assertFalse(R.windowOvhtLit(false, true, "OVHT"))
        assertTrue(R.equipOffOvht(false, false, false))
        assertFalse(R.equipOffOvht(false, true, false))
        assertTrue(R.equipOffOvht(true, true, true))
        assertEquals("E/E BAY TEMP 36°C · FLOW 50%", R.equipLine(36.2, 0.5))
        assertEquals(1.0, R.fitScale(2000.0), 0.0)
        assertEquals((360.0 - 18) / 1008, R.fitScale(360.0), 1.0e-12)
    }
}
