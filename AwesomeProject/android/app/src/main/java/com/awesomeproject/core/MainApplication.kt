package com.awesomeproject.core

import android.app.Application
import android.content.Intent
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.flipper.ReactNativeFlipper
import com.facebook.soloader.SoLoader
import com.awesomeproject.BuildConfig
import com.awesomeproject.bridge.AccessibilityPackage
import com.awesomeproject.service.TaskExecutionService
import com.awesomeproject.service.TaskExecutionHeadlessService

/**
 * Android Application 类 — 应用生命周期入口。
 *
 * 职责：
 *   - 初始化 React Native 运行时 (Hermes / New Architecture / Flipper)
 *   - 注册原生模块包 ([AccessibilityPackage])
 *   - 在应用终止时妥善停止后台服务 (TaskExecutionService / HeadlessService)
 *
 * Android Application class — application lifecycle entry point.
 * Initializes the RN runtime, registers native module packages,
 * and gracefully tears down background services on termination.
 */
class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // 注册无障碍服务原生模块 / Register AccessibilityService native module
              add(AccessibilityPackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(this.applicationContext, reactNativeHost)

  /**
   * 应用创建时初始化 SoLoader、New Architecture（如启用）和 Flipper 调试工具。
   */
  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, false)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      load()
    }
    ReactNativeFlipper.initializeFlipper(this, reactNativeHost.reactInstanceManager)
  }

  /**
   * 应用终止时停止所有后台服务，确保任务执行状态干净退出。
   *
   * Terminates background services to cleanly release task execution state
   * when the application is destroyed.
   */
  override fun onTerminate() {
    super.onTerminate()
    Log.d(TAG, "应用正在终止，停止所有后台服务 | Terminating — stopping background services")

    stopServiceSafely(TaskExecutionService::class.java)
    stopServiceSafely(TaskExecutionHeadlessService::class.java)
  }

  /**
   * 安全停止指定服务，失败时记录错误日志但不抛出异常。
   * Stops a service safely, logging errors without crashing.
   */
  private fun stopServiceSafely(serviceClass: Class<*>) {
    try {
      val intent = Intent(this, serviceClass)
      stopService(intent)
      Log.d(TAG, "${serviceClass.simpleName} 已停止 | stopped")
    } catch (e: Exception) {
      Log.e(TAG, "停止 ${serviceClass.simpleName} 失败 | failed to stop", e)
    }
  }

  companion object {
    private const val TAG = "MainApplication"
  }
}

