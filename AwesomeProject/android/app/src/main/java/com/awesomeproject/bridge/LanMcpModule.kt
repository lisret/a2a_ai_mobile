package com.awesomeproject.bridge

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import com.awesomeproject.lanmcp.Codes
import com.awesomeproject.lanmcp.ConnectionCode
import com.awesomeproject.lanmcp.DeviceControlOwnership
import com.awesomeproject.lanmcp.ExportPolicy
import com.awesomeproject.lanmcp.ExportVerdict
import com.awesomeproject.lanmcp.LanMcpRuntime
import com.awesomeproject.lanmcp.LanMcpService
import com.awesomeproject.lanmcp.LanMcpState
import com.awesomeproject.lanmcp.LanNetwork
import com.awesomeproject.security.CredentialStoreException
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * `NativeModules.LanMcpModule` — the only JS-facing surface of the LAN MCP service.
 *
 * Every method is asynchronous: work is performed on a private single-thread executor
 * so the React Native module queue and the UI thread are never blocked by Keystore
 * access, socket probing or status polling, and so code operations are serialized.
 *
 * The connection code is never returned by any method, never logged, and is refused
 * inside exported contents.
 */
class LanMcpModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext),
    ActivityEventListener {

    private val worker: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, THREAD_NAME).apply { isDaemon = true }
    }

    private val exportBusy = AtomicBoolean(false)

    @Volatile
    private var exportPromise: Promise? = null

    private var exportContents: ByteArray? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = MODULE_NAME

    // --- status ---------------------------------------------------------------

    @ReactMethod
    fun getStatus(promise: Promise) {
        submit(promise) { resolveStatus(promise) }
    }

    // Internal local-task lease: acquired before planning/execution can start in JS.
    @ReactMethod
    fun acquireLocalControl(owner: String, promise: Promise) {
        submit(promise) { promise.resolve(DeviceControlOwnership.acquireLocal(owner)) }
    }

    @ReactMethod
    fun releaseLocalControl(owner: String, promise: Promise) {
        submit(promise) {
            DeviceControlOwnership.releaseLocal(owner)
            promise.resolve(null)
        }
    }

    // --- service lifecycle ---------------------------------------------------

    @ReactMethod
    fun startService(promise: Promise) {
        submit(promise) {
            if (LanMcpState.running) {
                resolveStatus(promise)
                return@submit
            }
            val context = reactContext.applicationContext

            val code = LanMcpRuntime.readCode(context)
            val hasCode = code != null && code.isNotEmpty()
            code?.fill(0)
            if (!hasCode) {
                reject(promise, Codes.CODE_NOT_CONFIGURED, "尚未配置连接码，请先设置 12-128 位连接码")
                return@submit
            }

            val address = LanNetwork.privateWifiIpv4(context)
            if (address == null) {
                reject(promise, Codes.NO_WIFI_ADDRESS, "未连接到私有 Wi-Fi，无法获得可绑定的局域网 IPv4 地址")
                return@submit
            }
            // The server's actual bind is authoritative. A separate probe with
            // different socket reuse options can reject a valid immediate restart.
            val intent = Intent(context, LanMcpService::class.java).apply { action = LanMcpService.ACTION_START }
            // A previous failed attempt must not reject a new, successful start.
            LanMcpState.lastErrorCode = null
            LanMcpState.lastMessage = null
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (error: Exception) {
                reject(promise, Codes.BIND_FAILED, "无法启动前台服务：${error.javaClass.simpleName}")
                return@submit
            }

            val deadline = System.currentTimeMillis() + START_TIMEOUT_MS
            while (System.currentTimeMillis() < deadline) {
                if (LanMcpState.running) {
                    resolveStatus(promise)
                    return@submit
                }
                val failure = LanMcpState.lastErrorCode
                if (failure != null) {
                    reject(promise, failure, LanMcpState.lastMessage ?: failure)
                    return@submit
                }
                sleepQuietly(POLL_INTERVAL_MS)
            }
            LanMcpState.generation.markStopped()
            context.stopService(Intent(context, LanMcpService::class.java))
            reject(promise, Codes.START_TIMEOUT, "服务启动超时，已取消启动，请重试")
        }
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        submit(promise) {
            val context = reactContext.applicationContext
            // Revoke dispatch before waiting for Android to destroy the service.
            LanMcpState.generation.markStopped()
            try {
                context.stopService(Intent(context, LanMcpService::class.java))
            } catch (error: Exception) {
                reject(promise, Codes.INTERNAL, "无法关闭服务，请使用系统通知中的停止按钮")
                return@submit
            }
            val deadline = System.currentTimeMillis() + STOP_TIMEOUT_MS
            while ((LanMcpState.running || DeviceControlOwnership.remoteActive()) && System.currentTimeMillis() < deadline) {
                sleepQuietly(POLL_INTERVAL_MS)
            }
            if (LanMcpState.running || DeviceControlOwnership.remoteActive()) {
                reject(promise, Codes.INTERNAL, "服务正在关闭，请稍后确认状态")
                return@submit
            }
            resolveStatus(promise)
        }
    }

    // --- connection code -----------------------------------------------------

    @ReactMethod
    fun setConnectionCode(code: String?, promise: Promise) {
        submit(promise) {
            val value = code
            if (value == null || ConnectionCode.validate(value) != null) {
                reject(
                    promise,
                    Codes.INVALID_CODE,
                    "连接码必须为 ${ConnectionCode.MIN_LENGTH}-${ConnectionCode.MAX_LENGTH} 位，且仅包含 A-Z a-z 0-9 - _",
                )
                return@submit
            }
            if (LanMcpState.running) {
                reject(promise, Codes.SERVICE_RUNNING, "服务运行中不能更换连接码，请先停止服务")
                return@submit
            }
            try {
                LanMcpRuntime.storeCode(reactContext.applicationContext, value)
            } catch (error: CredentialStoreException) {
                reject(promise, error.code, error.code)
                return@submit
            } catch (error: Exception) {
                reject(promise, Codes.KEYSTORE_FAILURE, Codes.KEYSTORE_FAILURE)
                return@submit
            }
            resolveStatus(promise)
        }
    }

    // --- export --------------------------------------------------------------

    @ReactMethod
    fun exportConnectionFile(contents: String?, filename: String?, promise: Promise) {
        submit(promise) {
            val text = contents
            if (text == null || text.isEmpty()) {
                reject(promise, Codes.EXPORT_EMPTY, "导出内容为空")
                return@submit
            }
            val code = LanMcpRuntime.readCodeText(reactContext.applicationContext)
            when (val verdict = ExportPolicy.validate(text, code)) {
                is ExportVerdict.Rejected -> {
                    reject(promise, verdict.code, verdict.message)
                    return@submit
                }
                is ExportVerdict.Ok -> Unit
            }
            val safeName = ExportPolicy.sanitizeFilename(filename)
            UiThreadUtil.runOnUiThread { beginExport(text, safeName, promise) }
        }
    }

    private fun beginExport(contents: String, filename: String, promise: Promise) {
        if (!exportBusy.compareAndSet(false, true)) {
            reject(promise, Codes.EXPORT_IN_PROGRESS, "已有导出请求正在进行，请等待系统保存对话框完成")
            return
        }
        val activity = try {
            reactContext.currentActivity
        } catch (error: Exception) {
            null
        }
        if (activity == null) {
            exportBusy.set(false)
            reject(promise, Codes.NO_ACTIVITY, "当前没有可用的 Activity，无法打开系统保存对话框")
            return
        }
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = MIME_MARKDOWN
            putExtra(Intent.EXTRA_TITLE, filename)
        }
        try {
            exportPromise = promise
            exportContents = contents.toByteArray(Charsets.UTF_8)
            activity.startActivityForResult(intent, EXPORT_REQUEST_CODE)
        } catch (error: Exception) {
            exportPromise = null
            exportContents?.fill(0)
            exportContents = null
            exportBusy.set(false)
            reject(promise, Codes.EXPORT_WRITE_FAILED, "无法打开系统保存对话框")
        }
    }

    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != EXPORT_REQUEST_CODE) return
        val promise = exportPromise ?: return
        exportPromise = null
        val bytes = exportContents
        exportContents = null
        val uri: Uri? = data?.data

        if (resultCode != Activity.RESULT_OK || uri == null) {
            bytes?.fill(0)
            exportBusy.set(false)
            try {
                promise.resolve(RESULT_CANCELLED)
            } catch (_: Throwable) {
            }
            return
        }
        try {
            worker.execute { writeExport(promise, uri, bytes) }
        } catch (error: RejectedExecutionException) {
            bytes?.fill(0)
            exportBusy.set(false)
            try {
                promise.resolve(RESULT_CANCELLED)
            } catch (_: Throwable) {
            }
        }
    }

    private fun writeExport(promise: Promise, uri: Uri, bytes: ByteArray?) {
        try {
            val stream = reactContext.contentResolver.openOutputStream(uri)
            if (stream == null) {
                reject(promise, Codes.EXPORT_WRITE_FAILED, "无法写入所选文件")
                return
            }
            stream.use { output ->
                output.write(bytes ?: ByteArray(0))
                output.flush()
            }
            promise.resolve(RESULT_SAVED)
        } catch (error: Exception) {
            reject(promise, Codes.EXPORT_WRITE_FAILED, "写入导出文件失败：${error.javaClass.simpleName}")
        } finally {
            bytes?.fill(0)
            exportBusy.set(false)
        }
    }

    override fun onNewIntent(intent: Intent?) {
        // Not used: the export flow only relies on activity results.
    }

    override fun invalidate() {
        try {
            reactContext.removeActivityEventListener(this)
        } catch (_: Throwable) {
        }
        val promise = exportPromise
        exportPromise = null
        exportContents?.fill(0)
        exportContents = null
        exportBusy.set(false)
        if (promise != null) {
            try {
                promise.resolve(RESULT_CANCELLED)
            } catch (_: Throwable) {
            }
        }
        worker.shutdownNow()
        super.invalidate()
    }

    // --- helpers -------------------------------------------------------------

    private fun submit(promise: Promise, body: () -> Unit) {
        try {
            worker.execute {
                try {
                    body()
                } catch (error: Throwable) {
                    reject(promise, Codes.INTERNAL, "内部错误：${error.javaClass.simpleName}")
                }
            }
        } catch (error: RejectedExecutionException) {
            reject(promise, Codes.INTERNAL, "模块正在关闭")
        }
    }

    private fun resolveStatus(promise: Promise) {
        try {
            promise.resolve(toWritableMap(LanMcpRuntime.status(reactContext)))
        } catch (error: Exception) {
            reject(promise, Codes.INTERNAL, "读取状态失败")
        }
    }

    private fun reject(promise: Promise, code: String, message: String) {
        try {
            promise.reject(code, message)
        } catch (_: Throwable) {
        }
    }

    private fun sleepQuietly(millis: Long) {
        try {
            Thread.sleep(millis)
        } catch (error: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }

    /** Explicit map conversion so no value crosses the bridge as an untyped object. */
    private fun toWritableMap(payload: Map<String, Any?>): WritableMap {
        val map = Arguments.createMap()
        for ((key, value) in payload) {
            when (value) {
                null -> map.putNull(key)
                is Boolean -> map.putBoolean(key, value)
                is Int -> map.putInt(key, value)
                is Long -> map.putDouble(key, value.toDouble())
                is Double -> map.putDouble(key, value)
                is String -> map.putString(key, value)
                else -> map.putString(key, value.toString())
            }
        }
        return map
    }

    companion object {
        private const val MODULE_NAME = "LanMcpModule"
        private const val THREAD_NAME = "lan-mcp-module"
        private const val MIME_MARKDOWN = "text/markdown"
        private const val EXPORT_REQUEST_CODE = 4801
        private const val START_TIMEOUT_MS = 3000L
        private const val STOP_TIMEOUT_MS = 5000L
        private const val POLL_INTERVAL_MS = 100L

        const val RESULT_SAVED = "saved"
        const val RESULT_CANCELLED = "cancelled"
    }
}
