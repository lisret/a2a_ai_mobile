package com.awesomeproject.core

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.awesomeproject.service.AutoGLMAccessibilityService

/**
 * Android 主 Activity — React Native 宿主容器。
 *
 * 职责：
 *   - 加载 React Native JS Bundle 并渲染根组件
 *   - 处理 MediaProjection 权限请求（截图能力的前置条件）
 *   - 将获取到的 MediaProjection 递交给 [AutoGLMAccessibilityService] 供后续截图使用
 *
 * Android main Activity — React Native host container.
 * Handles JS bundle loading and the MediaProjection permission flow
 * required by the Accessibility Service for screen capture.
 */
class MainActivity : ReactActivity() {

  companion object {
    const val REQUEST_MEDIA_PROJECTION = 1001
    private var pendingPromise: ((Boolean) -> Unit)? = null
  }

  /**
   * React Native 主组件名，须与 [AppRegistry.registerComponent] 一致。
   * Name of the main component registered from JS — must match index.js.
   */
  override fun getMainComponentName(): String = "AwesomeProject"

  /**
   * 创建 ReactActivityDelegate，通过 [fabricEnabled] 控制 New Architecture 开关。
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * 请求屏幕录制权限 (MediaProjection)。
   *
   * 由 React Native 原生模块通过 Activity 引用调用。
   * 成功后 MediaProjection 会注入 [AutoGLMAccessibilityService] 供后续截图。
   *
   * Requests MediaProjection permission, invoked by RN native modules.
   * On success, the MediaProjection token is handed to the AccessibilityService
   * for subsequent screen capture.
   */
  fun requestMediaProjectionPermission(callback: (Boolean) -> Unit) {
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
      pendingPromise = callback
      val mediaProjectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      val captureIntent = mediaProjectionManager.createScreenCaptureIntent()
      startActivityForResult(captureIntent, REQUEST_MEDIA_PROJECTION)
    } else {
      callback(false)
    }
  }

  /**
   * 处理权限请求结果。
   * 系统权限弹窗返回后，将成功获取的 MediaProjection 注入无障碍服务。
   */
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)

    if (requestCode == REQUEST_MEDIA_PROJECTION) {
      val success = resultCode == Activity.RESULT_OK && data != null
      if (success && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
        val mediaProjectionManager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val mediaProjection = mediaProjectionManager.getMediaProjection(resultCode, data!!)
        AutoGLMAccessibilityService.setMediaProjection(mediaProjection)
      }
      pendingPromise?.invoke(success)
      pendingPromise = null
    }
  }
}

