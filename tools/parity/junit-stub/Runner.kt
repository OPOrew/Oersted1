fun main(args: Array<String>) {
    var pass = 0; var fail = 0
    for (cn in args) {
        val c = Class.forName(cn)
        val inst = c.getDeclaredConstructor().newInstance()
        for (m in c.declaredMethods) {
            if (m.getAnnotation(org.junit.Test::class.java) == null) continue
            try { m.invoke(inst); pass++; println("PASS ${c.simpleName}.${m.name}") }
            catch (e: java.lang.reflect.InvocationTargetException) { fail++; println("FAIL ${c.simpleName}.${m.name}: ${e.targetException.message}") }
        }
    }
    println("pass=$pass fail=$fail"); if (fail > 0) kotlin.system.exitProcess(1)
}
