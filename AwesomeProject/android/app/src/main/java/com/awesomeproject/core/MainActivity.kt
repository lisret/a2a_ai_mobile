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

class MainActivity : ReactActivity() {
  
  companion object {
    const val REQUEST_MEDIA_PROJECTION = 1001
    private var pendingPromise: ((Boolean) -> Unit)? = null
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "AwesomeProject"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * 请求 MediaProjection 权限（由 React Native 模块调用）
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

