# 方案3：Intent 查询所有可启动应用（最实用方案）

## 方案概述
通过查询所有可响应的 Intent（如 MAIN action）来获取所有可启动的应用，这种方法可以获取到所有有启动入口的应用，包括通过分享、深度链接等方式启动的应用。

## 优势
- ✅ 可以获取到所有真正可用的应用（有启动入口）
- ✅ 不依赖特殊权限
- ✅ 可以获取应用的主Activity信息
- ✅ 兼容性好，适用于所有 Android 版本

## 劣势
- ❌ 只能获取有启动入口的应用，无法获取纯服务类应用
- ❌ 某些应用可能没有标准的主Activity

## 实现代码

### Kotlin 原生模块实现

```kotlin
@ReactMethod
fun getAllLaunchableApps(promise: Promise) {
    try {
        Log.d("AccessibilityActionModule", "开始通过Intent查询所有可启动应用")
        
        val pm = reactApplicationContext.packageManager
        val appsMap = Arguments.createMap()
        val packageSet = mutableSetOf<String>()
        
        // 方法1: 查询 MAIN action 的 Intent（主入口）
        val mainIntent = Intent(Intent.ACTION_MAIN, null)
        mainIntent.addCategory(Intent.CATEGORY_LAUNCHER)
        
        val mainResolveInfos = pm.queryIntentActivities(mainIntent, 0)
        Log.d("AccessibilityActionModule", "MAIN Intent查询到 ${mainResolveInfos.size} 个应用")
        
        for (resolveInfo in mainResolveInfos) {
            try {
                val activityInfo = resolveInfo.activityInfo
                val packageName = activityInfo.packageName
                
                if (packageSet.contains(packageName)) {
                    continue
                }
                
                // 获取应用名称
                val appName = try {
                    val appInfo = pm.getApplicationInfo(packageName, 0)
                    pm.getApplicationLabel(appInfo).toString()
                } catch (e: Exception) {
                    // 如果获取失败，尝试从Activity获取
                    try {
                        pm.getApplicationLabel(activityInfo.applicationInfo).toString()
                    } catch (e2: Exception) {
                        packageName
                    }
                }
                
                appsMap.putString(appName, packageName)
                packageSet.add(packageName)
                
            } catch (e: Exception) {
                Log.w("AccessibilityActionModule", "处理MAIN Intent应用失败", e)
            }
        }
        
        // 方法2: 查询所有可能的启动Intent（包括其他入口）
        // 例如：通过分享、查看、编辑等Intent启动的应用
        val otherIntents = listOf(
            Intent(Intent.ACTION_VIEW),
            Intent(Intent.ACTION_SEND),
            Intent(Intent.ACTION_EDIT),
            Intent(Intent.ACTION_PICK)
        )
        
        for (intent in otherIntents) {
            try {
                val resolveInfos = pm.queryIntentActivities(intent, 0)
                
                for (resolveInfo in resolveInfos) {
                    try {
                        val packageName = resolveInfo.activityInfo.packageName
                        
                        // 如果已经添加过，跳过
                        if (packageSet.contains(packageName)) {
                            continue
                        }
                        
                        // 只添加有启动入口的应用（即有MAIN Intent的）
                        val launchIntent = pm.getLaunchIntentForPackage(packageName)
                        if (launchIntent != null) {
                            val appInfo = pm.getApplicationInfo(packageName, 0)
                            val appName = try {
                                pm.getApplicationLabel(appInfo).toString()
                            } catch (e: Exception) {
                                packageName
                            }
                            
                            appsMap.putString(appName, packageName)
                            packageSet.add(packageName)
                        }
                    } catch (e: Exception) {
                        // 忽略单个应用处理失败
                    }
                }
            } catch (e: Exception) {
                Log.w("AccessibilityActionModule", "查询其他Intent失败", e)
            }
        }
        
        // 方法3: 使用 getInstalledPackages 补充遗漏的应用
        // 某些应用可能没有标准的启动Intent，但仍需要记录
        try {
            val installedPackages = pm.getInstalledPackages(PackageManager.GET_META_DATA)
            
            for (packageInfo in installedPackages) {
                try {
                    val packageName = packageInfo.packageName
                    
                    // 如果已经添加过，跳过
                    if (packageSet.contains(packageName)) {
                        continue
                    }
                    
                    // 检查是否有启动Intent
                    val launchIntent = pm.getLaunchIntentForPackage(packageName)
                    if (launchIntent != null) {
                        val appName = try {
                            pm.getApplicationLabel(packageInfo.applicationInfo).toString()
                        } catch (e: Exception) {
                            packageName
                        }
                        
                        appsMap.putString(appName, packageName)
                        packageSet.add(packageName)
                    }
                } catch (e: Exception) {
                    // 忽略单个包处理失败
                }
            }
        } catch (e: Exception) {
            Log.w("AccessibilityActionModule", "补充查询失败", e)
        }
        
        Log.d("AccessibilityActionModule", "最终获取到 ${packageSet.size} 个可启动应用")
        promise.resolve(appsMap)
        
    } catch (e: Exception) {
        Log.e("AccessibilityActionModule", "获取可启动应用列表失败", e)
        promise.reject("ERROR", "获取应用列表失败: ${e.message}", e)
    }
}

/**
 * 获取所有可启动应用（仅MAIN Intent，性能更好）
 */
@ReactMethod
fun getMainLaunchableApps(promise: Promise) {
    try {
        Log.d("AccessibilityActionModule", "开始查询主启动入口应用")
        
        val pm = reactApplicationContext.packageManager
        val appsMap = Arguments.createMap()
        
        // 查询 MAIN + LAUNCHER 的Intent
        val mainIntent = Intent(Intent.ACTION_MAIN, null)
        mainIntent.addCategory(Intent.CATEGORY_LAUNCHER)
        
        val resolveInfos = pm.queryIntentActivities(mainIntent, 0)
        
        for (resolveInfo in resolveInfos) {
            try {
                val activityInfo = resolveInfo.activityInfo
                val packageName = activityInfo.packageName
                
                // 获取应用名称
                val appName = try {
                    val appInfo = pm.getApplicationInfo(packageName, 0)
                    pm.getApplicationLabel(appInfo).toString()
                } catch (e: Exception) {
                    try {
                        pm.getApplicationLabel(activityInfo.applicationInfo).toString()
                    } catch (e2: Exception) {
                        packageName
                    }
                }
                
                // 如果已经存在同名应用，使用包名区分
                if (appsMap.hasKey(appName)) {
                    val existingPackage = appsMap.getString(appName)
                    // 如果包名不同，使用 "应用名 (包名)" 格式
                    if (existingPackage != packageName) {
                        appsMap.putString("$appName ($packageName)", packageName)
                    }
                } else {
                    appsMap.putString(appName, packageName)
                }
                
            } catch (e: Exception) {
                Log.w("AccessibilityActionModule", "处理应用失败: ${resolveInfo.activityInfo.packageName}", e)
            }
        }
        
        Log.d("AccessibilityActionModule", "获取到 ${appsMap.size()} 个主启动入口应用")
        promise.resolve(appsMap)
        
    } catch (e: Exception) {
        Log.e("AccessibilityActionModule", "获取主启动入口应用失败", e)
        promise.reject("ERROR", "获取应用列表失败: ${e.message}", e)
    }
}
```

## 关键特性

1. **多Intent查询**
   - 查询 `MAIN + LAUNCHER` Intent（主启动入口）
   - 查询 `VIEW` Intent（查看类应用）
   - 查询 `SEND` Intent（分享类应用）
   - 查询 `EDIT` Intent（编辑类应用）
   - 查询 `PICK` Intent（选择类应用）

2. **去重机制**
   - 使用 `Set` 记录已添加的包名
   - 同名应用使用包名区分

3. **补充机制**
   - 使用 `getInstalledPackages` 补充可能遗漏的应用
   - 确保获取到所有有启动入口的应用

4. **异常处理**
   - 每个应用单独处理，单个失败不影响整体
   - 每个查询方法独立 try-catch

## Intent 查询说明

### ACTION_MAIN + CATEGORY_LAUNCHER
- 这是应用的主入口，通常对应桌面图标
- 所有正常的应用都应该有这个Intent

### 其他Intent类型
- `ACTION_VIEW`: 查看文件、链接等
- `ACTION_SEND`: 分享内容
- `ACTION_EDIT`: 编辑文件
- `ACTION_PICK`: 选择内容
- `ACTION_CALL`: 拨打电话
- `ACTION_SENDTO`: 发送到（如短信、邮件）

## 适用场景
- ✅ 只需要获取用户真正可以启动的应用
- ✅ 需要获取应用的主Activity信息
- ✅ 适用于应用启动器、应用选择器等场景
- ✅ 性能要求较高的场景（只查询MAIN Intent时）

## 注意事项
1. **只获取可启动应用**: 此方法无法获取纯服务类应用（如输入法、壁纸等）
2. **同名应用**: 某些应用可能有相同的名称，需要使用包名区分
3. **隐藏应用**: 某些应用可能没有标准的启动Intent，可能被遗漏
4. **性能考虑**: 查询多个Intent类型会降低性能，建议优先使用MAIN Intent

## 优化建议
1. **只查询MAIN Intent**: 如果只需要主入口应用，只查询MAIN Intent即可
2. **缓存结果**: 应用列表变化不频繁，可以缓存结果
3. **异步处理**: 如果应用数量很多，可以考虑异步处理
4. **分批查询**: 可以分批查询不同类型的Intent，提高响应速度

