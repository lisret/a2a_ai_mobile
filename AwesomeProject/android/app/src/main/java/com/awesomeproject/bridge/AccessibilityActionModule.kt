/**
 * 无障碍服务操作模块
 * 负责执行各种步骤操作（点击、长按、滑动、输入等）
 */

package com.awesomeproject.bridge

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import com.awesomeproject.service.AutoGLMAccessibilityService
import java.io.BufferedReader
import java.io.InputStreamReader

class AccessibilityActionModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "AccessibilityActionModule"
    }

    /**
     * 执行点击操作
     */
    @ReactMethod
    fun performClick(x: Int, y: Int, promise: Promise) {
        try {
            val service = AutoGLMAccessibilityService.getInstance()
            if (service == null) {
                promise.reject("ERROR", "无障碍服务未启用")
                return
            }
            
            val success = service.performClick(x, y)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("ERROR", "执行点击失败", e)
        }
    }

    /**
     * 执行长按操作
     */
    @ReactMethod
    fun performLongPress(x: Int, y: Int, promise: Promise) {
        try {
            val service = AutoGLMAccessibilityService.getInstance()
            if (service == null) {
                promise.reject("ERROR", "无障碍服务未启用")
                return
            }
            
            val success = service.performLongPress(x, y)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("ERROR", "执行长按失败", e)
        }
    }

    /**
     * 执行双击操作
     */
    @ReactMethod
    fun performDoubleTap(x: Int, y: Int, promise: Promise) {
        try {
            val service = AutoGLMAccessibilityService.getInstance()
            if (service == null) {
                promise.reject("ERROR", "无障碍服务未启用")
                return
            }
            
            val success = service.performDoubleTap(x, y)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("ERROR", "执行双击失败", e)
        }
    }

    /**
     * 执行滑动操作
     */
    @ReactMethod
    fun performSwipe(startX: Int, startY: Int, endX: Int, endY: Int, promise: Promise) {
        try {
            val service = AutoGLMAccessibilityService.getInstance()
            if (service == null) {
                promise.reject("ERROR", "无障碍服务未启用")
                return
            }
            
            val success = service.performSwipe(startX, startY, endX, endY)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("ERROR", "执行滑动失败", e)
        }
    }

    /**
     * 执行文本输入
     */
    @ReactMethod
    fun performTextInput(text: String, promise: Promise) {
        try {
            val service = AutoGLMAccessibilityService.getInstance()
            if (service == null) {
                promise.reject("ERROR", "无障碍服务未启用")
                return
            }
            
            val success = service.performTextInput(text)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("ERROR", "执行文本输入失败", e)
        }
    }

    /**
     * 执行返回操作
     */
    @ReactMethod
    fun performBack(promise: Promise) {
        try {
            val service = AutoGLMAccessibilityService.getInstance()
            if (service == null) {
                promise.reject("ERROR", "无障碍服务未启用")
                return
            }
            
            val success = service.performBack()
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("ERROR", "执行返回失败", e)
        }
    }

    /**
     * 执行Home操作（回到桌面）
     */
    @ReactMethod
    fun performHome(promise: Promise) {
        try {
            val service = AutoGLMAccessibilityService.getInstance()
            if (service == null) {
                promise.reject("ERROR", "无障碍服务未启用")
                return
            }
            
            val success = service.performHome()
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("ERROR", "执行Home操作失败", e)
        }
    }

    /**
     * 获取应用的主Activity名称（不需要root权限，使用PackageManager API）
     */
    @ReactMethod
    fun getMainActivity(packageName: String, promise: Promise) {
        try {
            val pm = reactApplicationContext.packageManager
            
            // 方法1: 通过queryIntentActivities查询MAIN+LAUNCHER Intent
            val mainIntent = Intent(Intent.ACTION_MAIN, null)
            mainIntent.addCategory(Intent.CATEGORY_LAUNCHER)
            mainIntent.setPackage(packageName)
            
            val resolveInfos = pm.queryIntentActivities(mainIntent, PackageManager.MATCH_DEFAULT_ONLY)
            if (resolveInfos.isNotEmpty()) {
                val activityName = resolveInfos[0].activityInfo.name
                Log.d("AccessibilityActionModule", "找到主Activity: $packageName/$activityName")
                promise.resolve(activityName)
                return
            }
            
            // 方法2: 通过getLaunchIntentForPackage获取
            val launchIntent = pm.getLaunchIntentForPackage(packageName)
            if (launchIntent != null && launchIntent.component != null) {
                val activityName = launchIntent.component!!.className
                // 提取Activity名称（去掉包名部分）
                val activityShortName = if (activityName.startsWith(packageName)) {
                    activityName.substring(packageName.length + 1)
                } else {
                    activityName
                }
                Log.d("AccessibilityActionModule", "通过getLaunchIntentForPackage找到主Activity: $packageName/$activityShortName")
                promise.resolve(activityShortName)
                return
            }
            
            // 方法3: 通过getPackageInfo获取所有Activity，查找MAIN+LAUNCHER
            try {
                val packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_ACTIVITIES)
                val activities = packageInfo.activities
                if (activities != null) {
                    for (activityInfo in activities) {
                        // 检查Activity是否有MAIN和LAUNCHER的Intent Filter
                        val testIntent = Intent(Intent.ACTION_MAIN, null)
                        testIntent.addCategory(Intent.CATEGORY_LAUNCHER)
                        testIntent.setClassName(packageName, activityInfo.name)
                        if (pm.resolveActivity(testIntent, 0) != null) {
                            Log.d("AccessibilityActionModule", "通过getPackageInfo找到主Activity: $packageName/${activityInfo.name}")
                            promise.resolve(activityInfo.name)
                            return
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w("AccessibilityActionModule", "getPackageInfo查询失败", e)
            }
            
            // 所有方法都失败
            promise.reject("ERROR", "无法找到应用的主Activity: $packageName")
        } catch (e: Exception) {
            Log.e("AccessibilityActionModule", "获取主Activity失败: $packageName", e)
            promise.reject("ERROR", "获取主Activity失败: ${e.message}", e)
        }
    }

    /**
     * 获取设备品牌（小写）
     */
    private fun getDeviceBrand(): String {
        return Build.BRAND.lowercase()
    }

    /**
     * 通用启动方案（适用于所有品牌）
     * 只使用 getLaunchIntentForPackage（最常用）
     */
    private fun launchAppWithGenericMethod(pm: PackageManager, packageName: String): Boolean {
        try {
            val intent = pm.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                intent.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                reactApplicationContext.startActivity(intent)
                Log.d("AccessibilityActionModule", "[通用方案] 使用getLaunchIntentForPackage启动应用: $packageName")
                return true
            }
        } catch (e: Exception) {
            Log.w("AccessibilityActionModule", "[通用方案] 启动失败: $packageName", e)
        }

        return false
    }

    /**
     * 品牌特定启动方案
     */
    private fun launchAppWithBrandSpecificMethod(pm: PackageManager, packageName: String): Boolean {
        val brand = getDeviceBrand()
        Log.d("AccessibilityActionModule", "[品牌方案] 检测到设备品牌: $brand")

        try {
            val intent = pm.getLaunchIntentForPackage(packageName)
            if (intent == null) {
                return false
            }

            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            intent.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)

            when (brand) {
                "xiaomi", "redmi" -> {
                    // MIUI特定优化
                    intent.putExtra("miui_start_activity", true)
                    // MIUI可能需要额外的标志
                    intent.flags = intent.flags or 0x10000000
                    Log.d("AccessibilityActionModule", "[品牌方案] 使用MIUI优化启动: $packageName")
                }
                "vivo" -> {
                    // vivo特定优化
                    intent.putExtra("vivo_start_activity", true)
                    // vivo可能需要额外的标志
                    intent.flags = intent.flags or 0x20000000
                    Log.d("AccessibilityActionModule", "[品牌方案] 使用vivo优化启动: $packageName")
                }
                "oppo", "oneplus", "realme" -> {
                    // ColorOS/OxygenOS特定优化
                    intent.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                    Log.d("AccessibilityActionModule", "[品牌方案] 使用ColorOS/OxygenOS优化启动: $packageName")
                }
                "huawei", "honor" -> {
                    // EMUI/HarmonyOS特定优化
                    intent.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                    Log.d("AccessibilityActionModule", "[品牌方案] 使用EMUI/HarmonyOS优化启动: $packageName")
                }
                "samsung" -> {
                    // One UI特定优化
                    intent.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                    Log.d("AccessibilityActionModule", "[品牌方案] 使用One UI优化启动: $packageName")
                }
                "meizu" -> {
                    // Flyme特定优化
                    intent.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                    Log.d("AccessibilityActionModule", "[品牌方案] 使用Flyme优化启动: $packageName")
                }
                else -> {
                    // 其他品牌使用通用优化
                    Log.d("AccessibilityActionModule", "[品牌方案] 使用通用优化启动: $packageName")
                }
            }

            reactApplicationContext.startActivity(intent)
            Log.d("AccessibilityActionModule", "[品牌方案] 启动成功: $packageName")
            return true
        } catch (e: Exception) {
            Log.w("AccessibilityActionModule", "[品牌方案] 启动失败: $packageName", e)
            return false
        }
    }

    /**
     * ADB命令启动方案（最后降级，只使用非root命令）
     */
    private fun launchAppWithADBCommand(packageName: String): Boolean {
        // 只保留非root的am start命令
        val commands = listOf(
            // 方法1: 使用 am start 命令（不指定Activity，让系统选择）
            "am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER $packageName",
            // 方法2: 使用 am start 命令（指定包名）
            "am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n $packageName/",
            // 方法3: 使用 am start 命令（尝试MainActivity）
            "am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n $packageName/.MainActivity"
        )

        for ((index, command) in commands.withIndex()) {
            try {
                Log.d("AccessibilityActionModule", "[ADB方案] 尝试方法${index + 1}: $command")
                val process = Runtime.getRuntime().exec(command)
                val exitCode = process.waitFor()
                
                if (exitCode == 0) {
                    Log.d("AccessibilityActionModule", "[ADB方案] 方法${index + 1}成功: $command")
                    return true
                } else {
                    // 读取错误输出
                    val errorReader = BufferedReader(InputStreamReader(process.errorStream))
                    val errorOutput = errorReader.readText()
                    Log.w("AccessibilityActionModule", "[ADB方案] 方法${index + 1}失败，退出码: $exitCode, 错误: $errorOutput")
                }
            } catch (e: Exception) {
                Log.w("AccessibilityActionModule", "[ADB方案] 方法${index + 1}异常: $command", e)
            }
        }

        return false
    }

    /**
     * 启动应用（多级降级策略）
     * 1. 先使用通用方案
     * 2. 如果失败，再尝试针对各个牌子的启动方案
     * 3. 如果还失败，最后降级到ADB命令
     * @param packageName 应用包名（如：com.example.app）
     */
    @ReactMethod
    fun launchApp(packageName: String, promise: Promise) {
        try {
            Log.d("AccessibilityActionModule", "尝试启动应用: $packageName")
            
            val pm = reactApplicationContext.packageManager
            
            // 检查应用是否已安装
            try {
                pm.getPackageInfo(packageName, 0)
            } catch (e: PackageManager.NameNotFoundException) {
                Log.e("AccessibilityActionModule", "应用未安装: $packageName")
                promise.reject("ERROR", "应用未安装: $packageName")
                return
            }
            
            // 步骤1: 尝试通用方案（适用于所有品牌）
            Log.d("AccessibilityActionModule", "[步骤1] 尝试通用方案")
            if (launchAppWithGenericMethod(pm, packageName)) {
                promise.resolve(true)
                return
            }
            
            // 步骤2: 尝试品牌特定方案
            Log.d("AccessibilityActionModule", "[步骤2] 通用方案失败，尝试品牌特定方案")
            if (launchAppWithBrandSpecificMethod(pm, packageName)) {
                promise.resolve(true)
                return
            }
            
            // 步骤3: 降级到ADB命令
            Log.d("AccessibilityActionModule", "[步骤3] 品牌方案失败，降级到ADB命令")
            if (launchAppWithADBCommand(packageName)) {
                promise.resolve(true)
                return
            }
            
            // 所有方法都失败
            val errorMsg = "无法启动应用: $packageName。已尝试：通用方案、品牌特定方案、ADB命令"
            Log.e("AccessibilityActionModule", errorMsg)
            promise.reject("ERROR", errorMsg)
        } catch (e: Exception) {
            Log.e("AccessibilityActionModule", "启动应用失败: $packageName", e)
            promise.reject("ERROR", "启动应用失败: ${e.message}", e)
        }
    }

    /**
     * 获取所有已安装应用的包名和名称映射（使用QUERY_ALL_PACKAGES权限，最正规的方法）
     * Android 11+ 推荐使用此方法，需要QUERY_ALL_PACKAGES权限
     * @returns 应用映射表，格式：{ "应用名称": "包名", ... }
     */
    @ReactMethod
    fun getAllInstalledAppsWithQueryAllPackages(promise: Promise) {
        try {
            Log.d("AccessibilityActionModule", "[正规方案] 使用QUERY_ALL_PACKAGES权限获取所有已安装应用列表")
            
            val pm = reactApplicationContext.packageManager
            val appsMap = Arguments.createMap()
            var appCount = 0
            
            // 使用QUERY_ALL_PACKAGES权限查询所有应用（Android 11+）
            // 这是最正规的方法，可以查询所有已安装的应用，包括其他应用
            val installedPackages = pm.getInstalledPackages(PackageManager.GET_META_DATA)
            
            for (packageInfo in installedPackages) {
                try {
                    val packageName = packageInfo.packageName
                    val appInfo = packageInfo.applicationInfo
                    
                    // 使用优化的应用名称获取方法
                    val appName = getAppName(pm, packageName, appInfo)
                    
                    // 检查应用是否有启动Activity（可启动的应用）
                    val launchIntent = pm.getLaunchIntentForPackage(packageName)
                    if (launchIntent != null) {
                        // 使用应用名称作为 key，包名作为 value
                        appsMap.putString(appName, packageName)
                        appCount++
                    }
                } catch (e: Exception) {
                    // 忽略单个应用获取失败的情况
                    Log.w("AccessibilityActionModule", "获取应用信息失败: ${packageInfo.packageName}", e)
                }
            }
            
            Log.d("AccessibilityActionModule", "[正规方案] QUERY_ALL_PACKAGES获取到 $appCount 个可启动应用")
            promise.resolve(appsMap)
        } catch (e: SecurityException) {
            // 如果没有QUERY_ALL_PACKAGES权限，会抛出SecurityException
            Log.w("AccessibilityActionModule", "[正规方案] QUERY_ALL_PACKAGES权限不足，需要降级", e)
            promise.reject("ERROR", "QUERY_ALL_PACKAGES权限不足: ${e.message}", e)
        } catch (e: Exception) {
            Log.e("AccessibilityActionModule", "[正规方案] QUERY_ALL_PACKAGES获取应用列表失败", e)
            promise.reject("ERROR", "获取应用列表失败: ${e.message}", e)
        }
    }

    /**
     * 获取所有已安装应用的包名和名称映射（标准方法，不使用QUERY_ALL_PACKAGES）
     * 适用于没有QUERY_ALL_PACKAGES权限的情况
     * @returns 应用映射表，格式：{ "应用名称": "包名", ... }
     */
    @ReactMethod
    fun getAllInstalledApps(promise: Promise) {
        try {
            Log.d("AccessibilityActionModule", "[标准方案] 不使用QUERY_ALL_PACKAGES权限获取所有已安装应用列表")
            
            val pm = reactApplicationContext.packageManager
            val appsMap = Arguments.createMap()
            var appCount = 0
            
            // 方法1: 获取所有已安装的应用（包括系统应用）
            // 注意：如果没有QUERY_ALL_PACKAGES权限，可能无法查询到所有应用
            val installedPackages = pm.getInstalledPackages(PackageManager.GET_META_DATA)
            
            for (packageInfo in installedPackages) {
                try {
                    val packageName = packageInfo.packageName
                    val appInfo = packageInfo.applicationInfo
                    
                    // 使用优化的应用名称获取方法
                    val appName = getAppName(pm, packageName, appInfo)
                    
                    // 检查应用是否有启动Activity（可启动的应用）
                    val launchIntent = pm.getLaunchIntentForPackage(packageName)
                    if (launchIntent != null) {
                        // 使用应用名称作为 key，包名作为 value
                        appsMap.putString(appName, packageName)
                        appCount++
                    }
                } catch (e: Exception) {
                    // 忽略单个应用获取失败的情况
                    Log.w("AccessibilityActionModule", "获取应用信息失败: ${packageInfo.packageName}", e)
                }
            }
            
            Log.d("AccessibilityActionModule", "[标准方案] 获取到 $appCount 个可启动应用")
            promise.resolve(appsMap)
        } catch (e: Exception) {
            Log.e("AccessibilityActionModule", "[标准方案] 获取应用列表失败", e)
            promise.reject("ERROR", "获取应用列表失败: ${e.message}", e)
        }
    }

    /**
     * 获取应用名称（优化版，尝试多个来源）
     * 优先从 ApplicationInfo 获取，如果失败或返回包名，则尝试从启动Activity获取
     */
    private fun getAppName(pm: PackageManager, packageName: String, appInfo: android.content.pm.ApplicationInfo? = null): String {
        // 方法1: 从 ApplicationInfo 获取
        if (appInfo != null) {
            try {
                val appName = pm.getApplicationLabel(appInfo).toString()
                // 如果获取到的名称不是包名，直接返回
                if (appName != packageName && appName.isNotEmpty()) {
                    return appName
                }
            } catch (e: Exception) {
                // 继续尝试其他方法
            }
        }
        
        // 方法2: 尝试从启动Activity的label获取
        try {
            val launchIntent = pm.getLaunchIntentForPackage(packageName)
            if (launchIntent != null) {
                val resolveInfo = pm.resolveActivity(launchIntent, 0)
                if (resolveInfo != null && resolveInfo.activityInfo != null) {
                    val activityLabel = resolveInfo.loadLabel(pm).toString()
                    if (activityLabel != packageName && activityLabel.isNotEmpty()) {
                        return activityLabel
                    }
                }
            }
        } catch (e: Exception) {
            // 继续尝试其他方法
        }
        
        // 方法3: 尝试从 MAIN + LAUNCHER Intent 的 Activity label 获取
        try {
            val mainIntent = Intent(Intent.ACTION_MAIN, null)
            mainIntent.addCategory(Intent.CATEGORY_LAUNCHER)
            mainIntent.setPackage(packageName)
            
            val resolveInfos = pm.queryIntentActivities(mainIntent, 0)
            if (resolveInfos.isNotEmpty()) {
                val firstResolveInfo = resolveInfos[0]
                val activityLabel = firstResolveInfo.loadLabel(pm).toString()
                if (activityLabel != packageName && activityLabel.isNotEmpty()) {
                    return activityLabel
                }
            }
        } catch (e: Exception) {
            // 继续尝试其他方法
        }
        
        // 方法4: 如果 appInfo 为 null，尝试重新获取
        if (appInfo == null) {
            try {
                val appInfo = pm.getApplicationInfo(packageName, 0)
                val appName = pm.getApplicationLabel(appInfo).toString()
                if (appName != packageName && appName.isNotEmpty()) {
                    return appName
                }
            } catch (e: Exception) {
                // 所有方法都失败，返回包名
            }
        }
        
        // 所有方法都失败，返回包名
        return packageName
    }

    /**
     * 获取所有已安装应用（混合多重策略，不使用root权限）
     * 优先使用正规方案，失败后再降级处理
     * @returns 应用映射表，格式：{ "应用名称": "包名", ... }
     */
    @ReactMethod
    fun getAllInstalledAppsHybrid(promise: Promise) {
        try {
            Log.d("AccessibilityActionModule", "开始使用混合策略获取所有应用（优先正规方案，失败后降级）")
            
            val pm = reactApplicationContext.packageManager
            val appsMap = Arguments.createMap()
            val packageSet = mutableSetOf<String>()
            var methodUsed = ""
            
            // 策略1: 优先使用 getInstalledPackages（最标准、最正规的方法）
            try {
                Log.d("AccessibilityActionModule", "[正规方案] 尝试策略1: getInstalledPackages")
                val installedPackages = pm.getInstalledPackages(
                    PackageManager.GET_META_DATA or 
                    PackageManager.GET_ACTIVITIES
                )
                
                for (packageInfo in installedPackages) {
                    try {
                        val packageName = packageInfo.packageName
                        val appInfo = packageInfo.applicationInfo
                        
                        // 使用优化的应用名称获取方法
                        val appName = getAppName(pm, packageName, appInfo)
                        
                        val launchIntent = pm.getLaunchIntentForPackage(packageName)
                        
                        if (!packageSet.contains(packageName)) {
                            if (launchIntent != null) {
                                appsMap.putString(appName, packageName)
                            } else {
                                // 即使没有启动Intent，也尝试获取应用名称（而不是直接使用包名）
                                if (appName != packageName) {
                                    appsMap.putString(appName, packageName)
                                } else {
                                    // 如果确实获取不到名称，才使用包名
                                    appsMap.putString(packageName, packageName)
                                }
                            }
                            packageSet.add(packageName)
                        }
                    } catch (e: Exception) {
                        // 忽略单个应用
                        Log.w("AccessibilityActionModule", "处理应用失败: ${packageInfo.packageName}", e)
                    }
                }
                
                if (packageSet.isNotEmpty()) {
                    methodUsed = "getInstalledPackages"
                    Log.d("AccessibilityActionModule", "[正规方案] 策略1成功，获取到 ${packageSet.size} 个应用")
                    
                    // 如果获取的应用数量合理（>=50个），直接返回，不再执行降级策略
                    if (packageSet.size >= 50) {
                        Log.d("AccessibilityActionModule", "[正规方案] 应用数量充足，直接返回，不执行降级策略")
                        promise.resolve(appsMap)
                        return
                    }
                }
            } catch (e: Exception) {
                Log.w("AccessibilityActionModule", "[正规方案] 策略1失败", e)
            }
            
            // 策略2: 如果策略1失败或获取的应用较少，尝试 getInstalledApplications（补充方案）
            if (packageSet.isEmpty() || packageSet.size < 50) {
                try {
                    Log.d("AccessibilityActionModule", "[补充方案] 尝试策略2: getInstalledApplications")
                    val installedApps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
                    
                    var addedCount = 0
                    for (appInfo in installedApps) {
                        try {
                            val packageName = appInfo.packageName
                            
                            if (packageSet.contains(packageName)) {
                                continue
                            }
                            
                            // 使用优化的应用名称获取方法
                            val appName = getAppName(pm, packageName, appInfo)
                            
                            val launchIntent = pm.getLaunchIntentForPackage(packageName)
                            
                            if (launchIntent != null) {
                                appsMap.putString(appName, packageName)
                            } else {
                                // 即使没有启动Intent，也尝试获取应用名称
                                if (appName != packageName) {
                                    appsMap.putString(appName, packageName)
                                } else {
                                    appsMap.putString(packageName, packageName)
                                }
                            }
                            packageSet.add(packageName)
                            addedCount++
                        } catch (e: Exception) {
                            // 忽略单个应用
                            Log.w("AccessibilityActionModule", "处理应用失败: ${appInfo.packageName}", e)
                        }
                    }
                    
                    if (addedCount > 0) {
                        methodUsed += " + getInstalledApplications"
                        Log.d("AccessibilityActionModule", "[补充方案] 策略2补充了 $addedCount 个应用")
                    }
                } catch (e: Exception) {
                    Log.w("AccessibilityActionModule", "[补充方案] 策略2失败", e)
                }
            }
            
            // 策略3: 通过 Intent 查询补充可启动应用（补充方案）
            if (packageSet.isEmpty() || packageSet.size < 50) {
                try {
                    Log.d("AccessibilityActionModule", "[补充方案] 尝试策略3: Intent查询")
                    val mainIntent = Intent(Intent.ACTION_MAIN, null)
                    mainIntent.addCategory(Intent.CATEGORY_LAUNCHER)
                    
                    val resolveInfos = pm.queryIntentActivities(mainIntent, 0)
                    var addedCount = 0
                    
                    for (resolveInfo in resolveInfos) {
                        try {
                            val packageName = resolveInfo.activityInfo.packageName
                            
                            if (packageSet.contains(packageName)) {
                                continue
                            }
                            
                            // 优先尝试从 Activity 的 label 获取（通常更准确）
                            val appName = try {
                                val activityLabel = resolveInfo.loadLabel(pm).toString()
                                if (activityLabel != packageName && activityLabel.isNotEmpty()) {
                                    activityLabel
                                } else {
                                    // 如果 Activity label 是包名，使用优化的获取方法
                                    getAppName(pm, packageName, resolveInfo.activityInfo.applicationInfo)
                                }
                            } catch (e: Exception) {
                                // 如果失败，使用优化的获取方法
                                getAppName(pm, packageName, null)
                            }
                            
                            appsMap.putString(appName, packageName)
                            packageSet.add(packageName)
                            addedCount++
                        } catch (e: Exception) {
                            // 忽略单个应用
                            Log.w("AccessibilityActionModule", "处理Intent应用失败", e)
                        }
                    }
                    
                    if (addedCount > 0) {
                        methodUsed += " + Intent查询"
                        Log.d("AccessibilityActionModule", "[补充方案] 策略3补充了 $addedCount 个应用")
                    }
                } catch (e: Exception) {
                    Log.w("AccessibilityActionModule", "[补充方案] 策略3失败", e)
                }
            }
            
            // 策略4: 如果前面的方法都失败或获取的应用太少，尝试使用 MATCH_UNINSTALLED_PACKAGES（降级方案）
            if (packageSet.isEmpty() || packageSet.size < 10) {
                try {
                    Log.d("AccessibilityActionModule", "[降级方案] 尝试策略4: MATCH_UNINSTALLED_PACKAGES")
                    val installedPackages = pm.getInstalledPackages(
                        PackageManager.GET_META_DATA or
                        PackageManager.MATCH_UNINSTALLED_PACKAGES
                    )
                    
                    var addedCount = 0
                    for (packageInfo in installedPackages) {
                        try {
                            val packageName = packageInfo.packageName
                            
                            if (packageSet.contains(packageName)) {
                                continue
                            }
                            
                            // 使用优化的应用名称获取方法
                            val appName = getAppName(pm, packageName, packageInfo.applicationInfo)
                            
                            val launchIntent = pm.getLaunchIntentForPackage(packageName)
                            
                            if (launchIntent != null) {
                                appsMap.putString(appName, packageName)
                            } else {
                                // 即使没有启动Intent，也尝试获取应用名称
                                if (appName != packageName) {
                                    appsMap.putString(appName, packageName)
                                } else {
                                    appsMap.putString(packageName, packageName)
                                }
                            }
                            packageSet.add(packageName)
                            addedCount++
                        } catch (e: Exception) {
                            // 忽略单个应用
                            Log.w("AccessibilityActionModule", "处理包失败: ${packageInfo.packageName}", e)
                        }
                    }
                    
                    if (addedCount > 0) {
                        methodUsed += " + MATCH_UNINSTALLED"
                        Log.d("AccessibilityActionModule", "[降级方案] 策略4补充了 $addedCount 个应用")
                    }
                } catch (e: Exception) {
                    Log.w("AccessibilityActionModule", "[降级方案] 策略4失败", e)
                }
            }
            
            Log.d("AccessibilityActionModule", "混合策略最终获取到 ${packageSet.size} 个应用，使用方法: $methodUsed")
            
            if (packageSet.isEmpty()) {
                promise.reject("ERROR", "所有策略都失败，无法获取应用列表")
            } else {
                promise.resolve(appsMap)
            }
            
        } catch (e: Exception) {
            Log.e("AccessibilityActionModule", "混合策略获取应用列表失败", e)
            promise.reject("ERROR", "获取应用列表失败: ${e.message}", e)
        }
    }
}

