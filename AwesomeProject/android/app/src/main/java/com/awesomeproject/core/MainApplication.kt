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

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // 注册无障碍服务模块
              add(AccessibilityPackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(this.applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, false)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    ReactNativeFlipper.initializeFlipper(this, reactNativeHost.reactInstanceManager)
  }

  override fun onTerminate() {
    super.onTerminate()
    Log.d("MainApplication", "应用正在终止，停止所有后台服务")
    // 停止任务执行服务
    try {
      val intent = Intent(this, TaskExecutionService::class.java)
      stopService(intent)
      Log.d("MainApplication", "TaskExecutionService 已停止")
    } catch (e: Exception) {
      Log.e("MainApplication", "停止 TaskExecutionService 失败", e)
    }
    
    // 停止 Headless JS 服务
    try {
      val intent = Intent(this, TaskExecutionHeadlessService::class.java)
      stopService(intent)
      Log.d("MainApplication", "TaskExecutionHeadlessService 已停止")
    } catch (e: Exception) {
      Log.e("MainApplication", "停止 TaskExecutionHeadlessService 失败", e)
    }
  }
}

