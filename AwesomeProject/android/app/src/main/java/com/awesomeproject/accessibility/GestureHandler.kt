/**
 * 手势处理模块
 * 负责执行各种手势操作（点击、长按、双击、滑动等）
 */

package com.awesomeproject.accessibility

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.util.Log
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class GestureHandler(private val service: AccessibilityService) {
    
    /**
     * 执行点击操作
     */
    fun performClick(x: Int, y: Int): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val path = Path().apply {
                moveTo(x.toFloat(), y.toFloat())
            }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, 100))
                .build()
            
            val latch = CountDownLatch(1)
            var success = false
            
            val dispatched = service.dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    Log.d("GestureHandler", "点击完成: ($x, $y)")
                    success = true
                    latch.countDown()
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    Log.w("GestureHandler", "点击取消: ($x, $y)")
                    success = false
                    latch.countDown()
                }
            }, null)
            
            if (!dispatched) {
                Log.e("GestureHandler", "手势分发失败: ($x, $y)")
                return false
            }
            
            try {
                val completed = latch.await(2, TimeUnit.SECONDS)
                if (!completed) {
                    Log.w("GestureHandler", "点击超时: ($x, $y)")
                    return false
                }
                return success
            } catch (e: InterruptedException) {
                Log.e("GestureHandler", "等待点击完成时被中断", e)
                return false
            }
        } else {
            Log.w("GestureHandler", "Android版本过低，不支持手势操作")
            false
        }
    }

    /**
     * 执行长按操作
     */
    fun performLongPress(x: Int, y: Int, duration: Long = 800): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val path = Path().apply {
                moveTo(x.toFloat(), y.toFloat())
            }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
                .build()
            
            val latch = CountDownLatch(1)
            var success = false
            
            val dispatched = service.dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    Log.d("GestureHandler", "长按完成: ($x, $y), 持续时间: ${duration}ms")
                    success = true
                    latch.countDown()
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    Log.w("GestureHandler", "长按取消: ($x, $y)")
                    success = false
                    latch.countDown()
                }
            }, null)
            
            if (!dispatched) {
                Log.e("GestureHandler", "长按手势分发失败: ($x, $y)")
                return false
            }
            
            try {
                val completed = latch.await(duration + 500, TimeUnit.MILLISECONDS)
                if (!completed) {
                    Log.w("GestureHandler", "长按超时: ($x, $y)")
                    return false
                }
                return success
            } catch (e: InterruptedException) {
                Log.e("GestureHandler", "等待长按完成时被中断", e)
                return false
            }
        } else {
            Log.w("GestureHandler", "Android版本过低，不支持手势操作")
            false
        }
    }

    /**
     * 执行双击操作
     */
    fun performDoubleTap(x: Int, y: Int): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val path = Path().apply {
                moveTo(x.toFloat(), y.toFloat())
            }
            
            val firstClick = GestureDescription.StrokeDescription(path, 0, 100)
            val secondClick = GestureDescription.StrokeDescription(path, 150, 100)
            
            val gesture = GestureDescription.Builder()
                .addStroke(firstClick)
                .addStroke(secondClick)
                .build()
            
            val latch = CountDownLatch(1)
            var success = false
            
            val dispatched = service.dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    Log.d("GestureHandler", "双击完成: ($x, $y)")
                    success = true
                    latch.countDown()
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    Log.w("GestureHandler", "双击取消: ($x, $y)")
                    success = false
                    latch.countDown()
                }
            }, null)
            
            if (!dispatched) {
                Log.e("GestureHandler", "双击手势分发失败: ($x, $y)")
                return false
            }
            
            try {
                val completed = latch.await(500, TimeUnit.MILLISECONDS)
                if (!completed) {
                    Log.w("GestureHandler", "双击超时: ($x, $y)")
                    return false
                }
                return success
            } catch (e: InterruptedException) {
                Log.e("GestureHandler", "等待双击完成时被中断", e)
                return false
            }
        } else {
            Log.w("GestureHandler", "Android版本过低，不支持手势操作")
            false
        }
    }

    /**
     * 执行滑动操作
     */
    fun performSwipe(startX: Int, startY: Int, endX: Int, endY: Int, duration: Long = 300): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val path = Path().apply {
                moveTo(startX.toFloat(), startY.toFloat())
                lineTo(endX.toFloat(), endY.toFloat())
            }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
                .build()
            
            service.dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) {
                    Log.d("GestureHandler", "滑动完成: ($startX, $startY) -> ($endX, $endY)")
                }

                override fun onCancelled(gestureDescription: GestureDescription?) {
                    Log.w("GestureHandler", "滑动取消: ($startX, $startY) -> ($endX, $endY)")
                }
            }, null)
            true
        } else {
            Log.w("GestureHandler", "Android版本过低，不支持手势操作")
            false
        }
    }
}

