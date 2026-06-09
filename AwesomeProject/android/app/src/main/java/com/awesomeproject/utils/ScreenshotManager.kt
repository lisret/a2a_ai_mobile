/**
 * 截图管理模块
 * 负责获取屏幕截图并转换为 base64 字符串
 */

package com.awesomeproject.utils

import android.graphics.Bitmap
import android.util.Base64
import android.util.Log
import java.io.ByteArrayOutputStream

class ScreenshotManager {
    /**
     * 将 Bitmap 转换为 base64 编码的 data URI
     * @param bitmap 要转换的 Bitmap
     * @return base64 编码的 data URI 字符串，失败返回 null
     */
    fun bitmapToBase64(bitmap: Bitmap?): String? {
        if (bitmap == null) {
            Log.e("ScreenshotManager", "Bitmap 为 null")
            return null
        }

        return try {
            Log.d("ScreenshotManager", "开始压缩和转换为 base64，尺寸: ${bitmap.width}x${bitmap.height} (保持原始分辨率)")
            
            // 保存原始分辨率信息
            val originalWidth = bitmap.width
            val originalHeight = bitmap.height
            
            // 压缩 Bitmap：使用 JPEG 格式，质量 70%，保持原始分辨率（不缩放）
            val outputStream = ByteArrayOutputStream()
            val compressStartTime = System.currentTimeMillis()
            
            // 使用 JPEG 格式压缩，质量 70%（平衡质量和大小），保持原始分辨率
            bitmap.compress(Bitmap.CompressFormat.JPEG, 70, outputStream)
            val byteArray = outputStream.toByteArray()
            val compressDuration = System.currentTimeMillis() - compressStartTime
            
            val base64 = Base64.encodeToString(byteArray, Base64.NO_WRAP)
            val originalSize = bitmap.byteCount
            val compressedSize = byteArray.size
            val compressionRatio = (1.0 - compressedSize.toDouble() / originalSize) * 100
            
            Log.d("ScreenshotManager", "压缩完成，耗时: ${compressDuration}ms, 原始大小: ${originalSize} 字节, 压缩后: ${compressedSize} 字节, 压缩率: ${String.format("%.1f", compressionRatio)}%, 分辨率: ${originalWidth}x${originalHeight} (保持原始分辨率)")
            Log.d("ScreenshotManager", "base64 转换完成，长度: ${base64.length}")
            
            // 返回 base64 字符串（带 data URI 前缀，使用 JPEG 格式）
            val dataUri = "data:image/jpeg;base64,$base64"
            dataUri
        } catch (e: Exception) {
            Log.e("ScreenshotManager", "转换 Bitmap 到 base64 失败", e)
            null
        }
    }
}

