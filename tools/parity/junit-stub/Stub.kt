package org.junit
@Retention(AnnotationRetention.RUNTIME) annotation class Test
object Assert {
    @JvmStatic fun assertEquals(msg: String?, exp: Any?, act: Any?) { if (exp != act) throw AssertionError("$msg: expected $exp but was $act") }
    @JvmStatic fun assertEquals(msg: String?, exp: Double, act: Double, delta: Double) { if (Math.abs(exp - act) > delta) throw AssertionError("$msg: expected $exp but was $act") }
    @JvmStatic fun assertEquals(exp: Any?, act: Any?) = assertEquals(null, exp, act)
    @JvmStatic fun assertEquals(exp: Double, act: Double, delta: Double) = assertEquals(null, exp, act, delta)
    @JvmStatic fun assertTrue(c: Boolean) { if (!c) throw AssertionError("not true") }
    @JvmStatic fun assertFalse(c: Boolean) { if (c) throw AssertionError("not false") }
}
