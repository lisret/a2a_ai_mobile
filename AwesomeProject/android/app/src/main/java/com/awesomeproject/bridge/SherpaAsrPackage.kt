package com.awesomeproject.bridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * 单独的 ReactPackage，专门注册 [SherpaAsrModule]。
 *
 * 不放进 [AccessibilityPackage]（本任务禁止改动它）。协调者需在
 * `MainApplication.getPackages()` 里加上 `SherpaAsrPackage()`。
 */
class SherpaAsrPackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): List<NativeModule> = listOf(SherpaAsrModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<*, *>> = emptyList()
}
