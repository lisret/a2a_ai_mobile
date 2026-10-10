package com.awesomeproject.lanmcp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.IBinder
import android.util.Base64
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.awesomeproject.core.MainActivity

/**
 * Foreground service hosting the LAN MCP endpoint.
 *
 * Behaviour fixed by the frozen interface:
 *  - started ONLY by an explicit user action, binds ONLY the current private Wi-Fi
 *    IPv4 address on port 8765 at `/mcp`;
 *  - a persistent notification with a Stop action is shown while it runs;
 *  - `START_NOT_STICKY`: nothing restarts it automatically (no boot receiver, no retry);
 *  - any Wi-Fi loss or address change stops it immediately;
 *  - stopping invalidates the request generation and waits (briefly) at the dispatch
 *    boundary, so nothing new is dispatched and an already-posted gesture is given the
 *    chance to finish before the service tears down its socket.
 *
 * Startup is fail-closed: if the foreground notification cannot be posted, if the bind
 * fails, or if the Wi-Fi monitor cannot be registered, the server is torn down and the
 * service reports the failure instead of running half-initialised. While it runs, every
 * device-touching MCP tool is refused if the in-app task service owns the device
 * ([LanMcpLocalTask]).
 */
class LanMcpService : Service() {

    private var server: LanMcpServer? = null
    private var ownsControl = false
    @Volatile private var boundNetwork: Network? = null
    private var connectivity: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    /** Live code bytes while running; wiped on stop. Never a String field, never logged. */
    @Volatile
    private var codeBytes: ByteArray? = null

    @Volatile
    private var generation: Long = -1L

    /** True only between a fully successful start and teardown; gates network callbacks. */
    @Volatile
    private var started: Boolean = false

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            LanMcpState.generation.markStopped()
            LanMcpState.running = false
            stopSelf()
            return START_NOT_STICKY
        }

        // A foreground service started with startForegroundService must post its
        // notification promptly; do it before any binding work.
        if (!startForegroundCompat(buildNotification("正在启动局域网 MCP 服务…"))) {
            // Fail closed: without a foreground notification the platform would kill the
            // process; never proceed to bind a socket.
            failStart(Codes.FOREGROUND_FAILED, "无法启动前台服务通知，局域网 MCP 服务未启动")
            return START_NOT_STICKY
        }

        if (server != null) {
            updateNotification()
            return START_NOT_STICKY
        }

        if (LanMcpLocalTask.isRunning() || !DeviceControlOwnership.acquireRemote()) {
            failStart(Codes.TASK_RUNNING, "设备正在执行任务或上一动作尚未结束，请稍后开启")
            return START_NOT_STICKY
        }
        ownsControl = true

        val code = LanMcpRuntime.readCode(applicationContext)
        if (code == null || code.isEmpty()) {
            code?.fill(0)
            failStart(Codes.CODE_NOT_CONFIGURED, "尚未配置连接码，请先在应用中设置 12-128 位连接码")
            return START_NOT_STICKY
        }

        val binding = LanNetwork.privateWifiBinding(applicationContext)
        if (binding == null) {
            code.fill(0)
            failStart(Codes.NO_WIFI_ADDRESS, "未连接到私有 Wi-Fi，无法绑定局域网地址")
            return START_NOT_STICKY
        }

        val address = binding.address
        boundNetwork = binding.network
        val startedGeneration = LanMcpState.generation.markStarted()
        val actions = AccessibilityDeviceActions(applicationContext)
        val executor = ToolExecutor(
            actions = actions,
            serializer = LanMcpState.actionSerializer,
            generation = LanMcpState.generation,
            base64 = { bytes -> Base64.encodeToString(bytes, Base64.NO_WRAP) },
            localTaskRunning = { LanMcpLocalTask.isRunning() || DeviceControlOwnership.localActive() },
        )
        val protocol = McpProtocol(executor = executor)
        val router = LanMcpHttpRouter(
            config = LanMcpHttpRouter.ServerConfig(address, LanNetwork.PORT),
            protocol = protocol,
            concurrency = ConcurrencyGate(MAX_CONCURRENT_REQUESTS),
            authenticate = { header -> BearerAuth.authorize(header, codeBytes) },
            isRunning = { LanMcpState.running },
        )
        val candidate = LanMcpServer(
            bindAddress = address,
            port = LanNetwork.PORT,
            router = router,
            dispatchGeneration = { generation },
            maxConcurrentConnections = MAX_CONCURRENT_CONNECTIONS,
        )

        try {
            candidate.startServer()
        } catch (error: java.net.BindException) {
            code.fill(0)
            releaseCandidate(candidate)
            LanMcpState.generation.markStopped()
            failStart(Codes.PORT_IN_USE, "端口 ${LanNetwork.PORT} 已被占用，无法启动服务")
            return START_NOT_STICKY
        } catch (error: Exception) {
            code.fill(0)
            releaseCandidate(candidate)
            LanMcpState.generation.markStopped()
            failStart(Codes.BIND_FAILED, "绑定 $address:${LanNetwork.PORT} 失败：${error.javaClass.simpleName}")
            return START_NOT_STICKY
        }

        server = candidate
        // Publish the address before monitoring so a callback can be compared against it,
        // but keep `running` false until the whole startup has succeeded.
        LanMcpState.bindAddress = address

        if (!registerNetworkMonitoring()) {
            code.fill(0)
            teardown(candidate)
            LanMcpState.generation.markStopped()
            failStart(Codes.NETWORK_MONITOR_FAILED, "无法注册 Wi-Fi 变化监听，服务已停止以避免失去网络变化保护")
            return START_NOT_STICKY
        }

        // A Wi-Fi change may have raced startup; never advertise an address we no longer hold.
        val currentBinding = LanNetwork.privateWifiBinding(applicationContext)
        if (currentBinding != binding) {
            code.fill(0)
            teardown(candidate)
            LanMcpState.generation.markStopped()
            failStart(Codes.NETWORK_CHANGED, "Wi-Fi 地址在启动过程中变化，服务未启动")
            return START_NOT_STICKY
        }

        codeBytes = code
        generation = startedGeneration
        started = true
        LanMcpState.markRunning(address, LanNetwork.PORT)
        updateNotification()
        Log.i(TAG, "LAN MCP service started on ${LanMcpState.endpoint}")
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        // Order matters: revoke dispatch first (bounded wait at the dispatch boundary), then
        // release the socket and the secret.
        started = false
        LanMcpState.running = false
        val boundaryFree = LanMcpState.generation.markStopped(REVOKE_WAIT_MILLIS)
        if (!boundaryFree) {
            // Honest reporting: a gesture was already handed to the platform; it cannot be
            // recalled, and no result will claim it was.
            Log.w(TAG, "stop: a device action was still in flight; it was not recalled")
        }
        LanMcpState.endpoint = null
        LanMcpState.bindAddress = null
        teardown(server)
        if (ownsControl) {
            ownsControl = false
            // Keep ownership until any already-dispatched platform gesture finishes.
            Thread({
                while (LanMcpState.actionSerializer.isBusy()) Thread.sleep(25)
                DeviceControlOwnership.releaseRemote()
            }, "lan-mcp-release").apply { isDaemon = true; start() }
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(Service.STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (_: Throwable) {
        }
        (getSystemService(NOTIFICATION_SERVICE) as? NotificationManager)?.cancel(NOTIFICATION_ID)
        super.onDestroy()
    }

    /**
     * Releases a server whose startup did not complete. Safe on an instance whose bind failed
     * (NanoHTTPD may have a partially created socket) and idempotent on a stopped one.
     */
    private fun releaseCandidate(candidate: LanMcpServer) {
        try {
            candidate.stopServer()
        } catch (_: Throwable) {
        }
    }

    /** Releases the socket, the monitor and the code without touching the published status. */
    private fun teardown(candidate: LanMcpServer?) {
        unregisterNetworkMonitoring()
        try {
            (candidate ?: server)?.stopServer()
        } catch (_: Throwable) {
        }
        server = null
        generation = -1L
        codeBytes?.fill(0)
        codeBytes = null
    }

    private fun failStart(code: String, message: String) {
        LanMcpState.reset(code, message)
        try {
            (getSystemService(NOTIFICATION_SERVICE) as? NotificationManager)
                ?.notify(NOTIFICATION_ID, buildNotification(message))
        } catch (_: Throwable) {
        }
        stopSelf()
    }

    // --- network monitoring ---------------------------------------------------

    /** @return true when Wi-Fi change monitoring is active; false is fatal for startup. */
    private fun registerNetworkMonitoring(): Boolean {
        val manager = (getSystemService(CONNECTIVITY_SERVICE) as? ConnectivityManager) ?: return false
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                revalidateBinding()
            }

            override fun onLost(network: Network) {
                revalidateBinding()
            }

            override fun onLinkPropertiesChanged(network: Network, linkProperties: LinkProperties) {
                revalidateBinding()
            }

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                revalidateBinding()
            }
        }
        return try {
            manager.registerNetworkCallback(
                NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(),
                callback,
            )
            connectivity = manager
            networkCallback = callback
            true
        } catch (error: Exception) {
            Log.e(TAG, "failed to register network callback", error)
            try {
                manager.unregisterNetworkCallback(callback)
            } catch (_: Throwable) {
            }
            false
        }
    }

    private fun unregisterNetworkMonitoring() {
        val manager = connectivity
        val callback = networkCallback
        networkCallback = null
        connectivity = null
        if (manager == null || callback == null) return
        try {
            manager.unregisterNetworkCallback(callback)
        } catch (_: Throwable) {
        }
    }

    /**
     * Stops the service when the bound address is gone or changed. There is no
     * re-bind attempt and no restart: the user must start the service again.
     */
    private fun revalidateBinding() {
        if (!started || server == null) return
        val bound = LanMcpState.bindAddress
        val current = LanNetwork.privateWifiBinding(applicationContext)
        if (current == null || current.address != bound || current.network != boundNetwork) {
            started = false
            LanMcpState.generation.markStopped()
            LanMcpState.reset(Codes.NETWORK_CHANGED, "Wi-Fi 网络或地址变化，服务已停止")
            stopSelf()
        }
    }

    // --- notification --------------------------------------------------------

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "局域网 MCP 服务运行状态，含停止按钮"
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
            }
            (getSystemService(NOTIFICATION_SERVICE) as? NotificationManager)?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(statusText: String): Notification {
        val stopIntent = Intent(this, LanMcpService::class.java).apply { action = ACTION_STOP }
        val stopPendingIntent = PendingIntent.getService(
            this,
            STOP_REQUEST_CODE,
            stopIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val openIntent = Intent(this, MainActivity::class.java)
        val openPendingIntent = PendingIntent.getActivity(
            this,
            OPEN_REQUEST_CODE,
            openIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val icon = try {
            packageManager.getApplicationInfo(packageName, 0).icon
        } catch (error: Exception) {
            android.R.drawable.ic_dialog_info
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(NOTIFICATION_TITLE)
            .setContentText(statusText)
            .setSmallIcon(icon)
            .setContentIntent(openPendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "停止", stopPendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setShowWhen(false)
            .setAutoCancel(false)
            .build()
    }

    /** @return true when the foreground notification was accepted by the platform. */
    private fun startForegroundCompat(notification: Notification): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ServiceCompat.startForeground(
                    this,
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            true
        } catch (error: Exception) {
            Log.e(TAG, "startForeground failed", error)
            false
        }
    }

    private fun updateNotification() {
        val address = LanMcpState.bindAddress
        val text = if (address == null) {
            "服务运行中"
        } else {
            "监听 ${LanMcpState.endpoint}（仅供受信任的私有 Wi-Fi 使用，未加密）"
        }
        try {
            (getSystemService(NOTIFICATION_SERVICE) as? NotificationManager)?.notify(NOTIFICATION_ID, buildNotification(text))
        } catch (error: Exception) {
            Log.e(TAG, "notification update failed", error)
        }
    }

    companion object {
        private const val TAG = "LanMcpService"

        const val ACTION_START = "com.awesomeproject.lanmcp.action.START"
        const val ACTION_STOP = "com.awesomeproject.lanmcp.action.STOP"

        const val CHANNEL_ID = "lan_mcp_service_channel"
        const val CHANNEL_NAME = "局域网 MCP 服务"
        const val NOTIFICATION_ID = 1002
        const val NOTIFICATION_TITLE = "局域网 MCP 服务运行中"

        /** In-flight MCP requests (router gate). */
        const val MAX_CONCURRENT_REQUESTS = 4

        /** Accepted sockets with a running handler (bounded NanoHTTPD runner). */
        const val MAX_CONCURRENT_CONNECTIONS = 8

        /**
         * How long the stop path waits at the dispatch boundary for an in-flight gesture.
         * Bounded so service teardown cannot block the main thread on a long swipe; when it
         * expires the generation is still revoked (no new dispatch) and the in-flight
         * gesture simply completes, which is logged rather than misreported.
         */
        private const val REVOKE_WAIT_MILLIS = 0L

        private const val STOP_REQUEST_CODE = 11
        private const val OPEN_REQUEST_CODE = 12
    }
}
