package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveWeatherTest {
    @Test fun tileUrlUsesThreeDecimals() {
        assertEquals("https://tilecache.rainviewer.com/abc/256/5/1.234/103.988/2/1_1.png",
            LiveWeather.tileUrl("https://tilecache.rainviewer.com", "/abc", 1.2344, 103.9879))
    }

    @Test fun blackTileGivesNoCellsAndNoIntensity() {
        val a = LiveWeather.analyze({ _, _ -> Triple(0, 0, 0) }, "")
        assertEquals(0, a.cells.size)
        assertEquals(0.0, a.intensity, 1e-9)
        assertTrue(!a.thunderstorm)
    }

    @Test fun brightTileGivesNineCellsAndThunderstorm() {
        val a = LiveWeather.analyze({ _, _ -> Triple(255, 200, 0) }, "")
        assertEquals(9, a.cells.size)
        assertEquals(1.0, a.intensity, 1e-9)
        assertTrue(a.thunderstorm)
        // top-left sample: x=8, y=8 -> nmX=-96, nmY=96; radius 6 + 1*8 = 14
        val c = a.cells[0]
        assertEquals(-96.0, c.x, 1e-9)
        assertEquals(96.0, c.y, 1e-9)
        assertEquals(14.0, c.r, 1e-9)
        assertEquals(1.2, c.asp, 1e-9)
        assertEquals(30.0, c.ang, 1e-9)
    }

    @Test fun thunderstormMetarWithQuietTileFlagsStorm() {
        val a = LiveWeather.analyze({ _, _ -> Triple(0, 0, 0) }, "WSSS 011200Z 18010KT VCTS")
        assertTrue(a.thunderstorm)
        assertEquals(0.0, a.intensity, 1e-9)
    }
}
