package com.oersted.trainer.sim

import org.junit.Assert.assertTrue
import org.junit.Test

class MaintenanceInterlocksTest {
    @Test fun generatorDriveResetNeedsGroundAndLowN2() {
        assertTrue(MaintenanceInterlocks.canResetGeneratorDrive(true, 4.0))
        assertTrue(!MaintenanceInterlocks.canResetGeneratorDrive(false, 4.0))
        assertTrue(!MaintenanceInterlocks.canResetGeneratorDrive(true, 6.0))
        assertTrue(!MaintenanceInterlocks.canResetGeneratorDrive(true, Double.NaN))
    }
}
