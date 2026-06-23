package com.awesomeproject.bridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * React Native 原生模块注册包 (Native Module Package)
 *
 * 将 Kotlin 侧的所有 NativeModule 注册到 React Native Bridge：
 *   - [AccessibilityModule] — 无障碍服务基础操作（截图、手势注入）
 *   - [AccessibilityActionModule] — 高级无障碍动作（输入、应用启动）
 *   - [ADBModule] — ADB shell 命令执行（降级通道）
 *   - [FloatingWindowModule] — 悬浮窗创建与生命周期管理
 *
 * 在 [com.awesomeproject.core.MainApplication.getPackages] 中注册。
 *
 * Registers all Kotlin NativeModules with the React Native bridge.
 * Called from MainApplication.getPackages().
 */
class AccessibilityPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            AccessibilityModule(reactContext),
            AccessibilityActionModule(reactContext),
            ADBModule(reactContext),
            FloatingWindowModule(reactContext)
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
