package com.awesomeproject.lanmcp

/** One owner for the full local task or the entire enabled remote-control session. */
object DeviceControlOwnership {
    private var localOwner: String? = null
    private var remote = false

    @Synchronized fun acquireLocal(owner: String): Boolean {
        if (owner.isBlank() || remote || localOwner != null) return false
        localOwner = owner
        return true
    }
    @Synchronized fun releaseLocal(owner: String) {
        if (localOwner == owner) localOwner = null
    }
    @Synchronized fun acquireRemote(): Boolean {
        if (localOwner != null || remote) return false
        remote = true
        return true
    }
    @Synchronized fun releaseRemote() { remote = false }
    @Synchronized fun localActive(): Boolean = localOwner != null
    @Synchronized fun remoteActive(): Boolean = remote
}
