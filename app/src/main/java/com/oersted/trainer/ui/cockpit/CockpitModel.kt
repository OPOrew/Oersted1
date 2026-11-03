package com.oersted.trainer.ui.cockpit

import com.oersted.trainer.platform.PhaseTimer
import com.oersted.trainer.sim.ActiveFlightPlan
import com.oersted.trainer.sim.CockpitReadout
import com.oersted.trainer.sim.FlightNavigator
import com.oersted.trainer.sim.MipLocal.AttHdgRequest
import com.oersted.trainer.sim.FlightPlanDraft
import com.oersted.trainer.sim.FlightRoute
import com.oersted.trainer.sim.FlightPhases.Phase
import com.oersted.trainer.sim.MipLocal
import com.oersted.trainer.sim.PitotStatic
import com.oersted.trainer.sim.SixPackData
import com.oersted.trainer.sim.Pedestal
import com.oersted.trainer.sim.PhaseController
import com.oersted.trainer.sim.SimPhaseWorld
import com.oersted.trainer.sim.SimStore
import com.oersted.trainer.sim.initialSimState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.min

/**
 * Owns the sim, the flight-phase controller and their timers for the cockpit screen.
 * Wiring matches the parity test (PhaseLongE2EWebParityTest): SimStore + MIP/pedestal holders + SimPhaseWorld + PhaseController.
 * The sim step follows SimTicker.tsx: accumulate real time, step once at least 30 ms has passed, each step capped at 0.25 s.
 * Everything runs on [scope]; use a main-thread scope so the UI and the sim never race.
 * Not compiled in the sandbox (needs the Android SDK and kotlinx-coroutines).
 */
class CockpitModel(
    private val scope: CoroutineScope,
    private val monoSec: () -> Double = { System.nanoTime() / 1e9 },
) {
    private var plan: ActiveFlightPlan? = null
    private val clockMs: () -> Long = { System.currentTimeMillis() }
    private val nav = FlightNavigator()
    private val sim = SimStore(initialSimState(), nav, { plan }, { clockMs().toDouble() })
    private val mip = MipLocal.Holder()
    private val pedestal = Pedestal.Holder()
    private val world = SimPhaseWorld(sim, mip, pedestal, nav, { clockMs() }, monoSec, { plan })
    private val controller = PhaseController(world)
    private val phaseTimer = PhaseTimer(scope, controller, monoSec)
    private var simJob: Job? = null

    private val _sixPack = MutableStateFlow(sixPackSnapshot())
    /** Primary flight instruments (attitude, heading, both sides' airspeed / altitude / VSI). */
    val sixPack: StateFlow<SixPackData> = _sixPack.asStateFlow()

    private val _activePlanLabel = MutableStateFlow<String?>(null)
    /** e.g. "RPLL → WSSS" when a plan is active, null otherwise. */
    val activePlanLabel: StateFlow<String?> = _activePlanLabel.asStateFlow()

    private val _readout = MutableStateFlow(snapshot())
    val readout: StateFlow<CockpitReadout> = _readout.asStateFlow()

    /**
     * Activates a draft, as the web's publishAndArm: publish the plan, set PLAN NAV and the runway-heading request,
     * then load the plan into the controls. The aircraft stays parked until TAKEOFF is pressed.
     */
    fun activate(draft: FlightPlanDraft) {
        val active = draft.toActive(java.time.Instant.now().toString())
        plan = active
        val hdg = FlightRoute.departureRunwayHeadingMag(active)
        mip.set { m -> m.copy(planNav = true, attHdgReq = if (hdg != null) AttHdgRequest(n = m.attHdgReq.n + 1, hdg = hdg) else m.attHdgReq) }
        controller.loadPlanIntoControls()
        _activePlanLabel.value = "${active.departure} → ${active.destination}"
        publish()
    }

    /** Activates a plan (null clears it). Loads it into the controls, as the web's loadPlanIntoControls does. */
    fun setPlan(p: ActiveFlightPlan?) {
        plan = p
        if (p != null) controller.loadPlanIntoControls()
        publish()
    }

    fun start() {
        if (simJob?.isActive == true) return
        phaseTimer.start()
        simJob = scope.launch {
            var last = monoSec()
            var acc = 0.0
            while (isActive) {
                delay(STEP_POLL_MS)
                val now = monoSec()
                acc += min(0.25, now - last)
                last = now
                if (acc >= SIM_STEP_S) {
                    sim.tick(min(0.25, acc))
                    acc = 0.0
                }
                publish()
            }
        }
    }

    fun stop() {
        simJob?.cancel()
        simJob = null
        phaseTimer.stop()
    }

    fun startPhase(p: Phase) {
        controller.startPhase(p)
        publish()
    }

    private fun snapshot(): CockpitReadout = CockpitReadout.build(
        controller.phase, controller.hint, sim.current(), { p: Phase -> controller.canStart(p) },
    )

    private fun sixPackSnapshot(): SixPackData {
        val st = sim.current()
        val d = sim.derived(st)
        val air = PitotStatic.computeAirData(st, d.dcPower, d.acPower)
        val m = mip.state
        return SixPackData.build(st, m.attLive, m.att, air)
    }

    private fun publish() {
        _readout.value = snapshot()
        _sixPack.value = sixPackSnapshot()
    }

    private companion object {
        const val SIM_STEP_S = 0.03
        const val STEP_POLL_MS = 30L
    }
}
