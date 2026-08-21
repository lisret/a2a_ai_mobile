package com.awesomeproject.security

internal class LockedAliasInitializer<T : Any>(
    private val lookup: () -> T?,
    private val lockBoundary: (action: () -> T) -> T,
    private val create: () -> T,
) {
    fun getOrCreate(): T = lookup() ?: lockBoundary {
        lookup() ?: create()
    }
}
