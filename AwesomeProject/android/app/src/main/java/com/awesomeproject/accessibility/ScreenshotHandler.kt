/**
 * 截图处理模块
 * 负责处理不同 Android 版本的截图功能
 */

package com.awesomeproject.accessibility

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.hardware.display.DisplayManager
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import android.view.WindowManager
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class ScreenshotHandler(private val service: AccessibilityService) {
    
    /**
     * 获取屏幕截图
     */
    fun captureScreen(mediaProjection: MediaProjection?): Bitmap? {
        return try {
            Log.d("ScreenshotHandler", "开始截图，Android SDK版本: ${Build.VERSION.SDK_INT}")
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // Android 11+ 使用 takeScreenshot API
                return captureScreenWithTakeScreenshot()
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                // Android 5.0+ 使用 MediaProjection API
                if (mediaProjection == null) {
                    Log.e("ScreenshotHandler", "MediaProjection 未设置")
                    return null
                }
                return captureScreenWithMediaProjection(mediaProjection)
            } else {
                Log.w("ScreenshotHandler", "Android 5.0 以下版本（SDK ${Build.VERSION.SDK_INT}）不支持截图")
                return null
            }
        } catch (e: Exception) {
            Log.e("ScreenshotHandler", "截图异常", e)
            null
        }
    }

    /**
     * 使用 takeScreenshot API 截图（Android 11+）
     */
    private fun captureScreenWithTakeScreenshot(): Bitmap? {
        return try {
            Log.d("ScreenshotHandler", "使用 takeScreenshot API")
            val screenshotRef = arrayOf<Bitmap?>(null)
            val latch = CountDownLatch(1)
            val errorRef = arrayOf<Int?>(null)
            
            val handler = Handler(Looper.getMainLooper())
            handler.post {
                try {
                    Log.d("ScreenshotHandler", "调用 takeScreenshot...")
                    service.takeScreenshot(
                        Display.DEFAULT_DISPLAY,
                        service.mainExecutor,
                        object : AccessibilityService.TakeScreenshotCallback {
                            override fun onSuccess(result: AccessibilityService.ScreenshotResult) {
                                try {
                                    Log.d("ScreenshotHandler", "截图回调成功，开始处理结果")
                                    
                                    val windowManager = service.getSystemService(WindowManager::class.java)
                                    val displayMetrics = DisplayMetrics()
                                    windowManager.defaultDisplay.getRealMetrics(displayMetrics)
                                    
                                    val bitmap = Bitmap.wrapHardwareBuffer(
                                        result.hardwareBuffer,
                                        result.colorSpace
                                    )
                                    if (bitmap != null) {
                                        screenshotRef[0] = bitmap
                                    } else {
                                        Log.e("ScreenshotHandler", "wrapHardwareBuffer 返回 null")
                                    }
                                } catch (e: Exception) {
                                    Log.e("ScreenshotHandler", "处理截图结果失败", e)
                                } finally {
                                    latch.countDown()
                                }
                            }
                            
                            override fun onFailure(errorCode: Int) {
                                val errorMsg = when (errorCode) {
                                    AccessibilityService.ERROR_TAKE_SCREENSHOT_INVALID_WINDOW -> "无效窗口"
                                    AccessibilityService.ERROR_TAKE_SCREENSHOT_NO_ACCESSIBILITY_ACCESS -> "无无障碍权限"
                                    AccessibilityService.ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT -> "截图间隔太短"
                                    AccessibilityService.ERROR_TAKE_SCREENSHOT_SECURE_WINDOW -> "安全窗口无法截图"
                                    else -> "未知错误码: $errorCode"
                                }
                                Log.e("ScreenshotHandler", "截图失败: $errorMsg (错误码: $errorCode)")
                                errorRef[0] = errorCode
                                latch.countDown()
                            }
                        }
                    )
                } catch (e: Exception) {
                    Log.e("ScreenshotHandler", "调用 takeScreenshot 异常", e)
                    errorRef[0] = -1
                    latch.countDown()
                }
            }
            
            val success = latch.await(5, TimeUnit.SECONDS)
            if (!success) {
                Log.e("ScreenshotHandler", "截图超时（5秒）")
                return null
            }
            
            if (errorRef[0] != null) {
                return null
            }
            
            screenshotRef[0]
        } catch (e: Exception) {
            Log.e("ScreenshotHandler", "takeScreenshot 截图异常", e)
            null
        }
    }

    /**
     * 使用 MediaProjection API 截图（Android 5.0+）
     */
    private fun captureScreenWithMediaProjection(projection: MediaProjection): Bitmap? {
        return try {
            val windowManager = service.getSystemService(WindowManager::class.java)
            val display = windowManager.defaultDisplay
            val displayMetrics = DisplayMetrics()
            display.getRealMetrics(displayMetrics)
            val width = displayMetrics.widthPixels
            val height = displayMetrics.heightPixels
            val density = displayMetrics.densityDpi

            Log.d("ScreenshotHandler", "准备截图，屏幕尺寸: ${width}x${height}, DPI: $density")

            val imageReader = ImageReader.newInstance(width, height, android.graphics.PixelFormat.RGBA_8888, 1)
            val surface = imageReader.surface

            val virtualDisplay = projection.createVirtualDisplay(
                "ScreenCapture",
                width, height, density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                surface, null, null
            )

            val latch = CountDownLatch(1)
            val bitmapRef = arrayOf<Bitmap?>(null)

            imageReader.setOnImageAvailableListener({ reader ->
                try {
                    val image = reader.acquireLatestImage()
                    if (image != null) {
                        val planes = image.planes
                        val buffer = planes[0].buffer
                        val pixelStride = planes[0].pixelStride
                        val rowStride = planes[0].rowStride
                        val rowPadding = rowStride - pixelStride * width

                        val bitmap = Bitmap.createBitmap(
                            width + rowPadding / pixelStride,
                            height,
                            Bitmap.Config.ARGB_8888
                        )
                        bitmap.copyPixelsFromBuffer(buffer)
                        
                        val finalBitmap = if (rowPadding == 0) {
                            bitmap
                        } else {
                            Bitmap.createBitmap(bitmap, 0, 0, width, height)
                        }
                        
                        bitmapRef[0] = finalBitmap
                        image.close()
                        Log.d("ScreenshotHandler", "MediaProjection 截图成功，尺寸: ${finalBitmap.width}x${finalBitmap.height}")
                    }
                } catch (e: Exception) {
                    Log.e("ScreenshotHandler", "处理 MediaProjection 图像失败", e)
                } finally {
                    latch.countDown()
                }
            }, Handler(Looper.getMainLooper()))

            val success = latch.await(3, TimeUnit.SECONDS)
            
            virtualDisplay.release()
            imageReader.close()

            if (success && bitmapRef[0] != null) {
                return bitmapRef[0]
            } else {
                Log.e("ScreenshotHandler", "MediaProjection 截图超时或失败")
                return null
            }
        } catch (e: Exception) {
            Log.e("ScreenshotHandler", "MediaProjection 截图异常", e)
            null
        }
    }
}

