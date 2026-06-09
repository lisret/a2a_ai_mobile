# 方案1：双重 PackageManager 获取（最兼容方案）

## 方案概述
使用 `getInstalledPackages()` 和 `getInstalledApplications()` 两种方法双重获取，确保在不同 Android 版本和厂商定制系统上都能获取到完整的应用列表。

## 优势
- ✅ 兼容性最好，适用于所有 Android 版本（API 1+）
- ✅ 不依赖外部工具（ADB、无障碍服务等）
- ✅ 可以获取系统应用和用户应用
- ✅ 性能较好，在设备本地执行

## 实现代码

### Kotlin 原生模块实现

```kotlin
@ReactMethod
fun getAllInstalledAppsComprehensive(promise: Promise) {
    try {
        Log.d("AccessibilityActionModule", "开始使用双重方法获取所有已安装应用列表")
        
        val pm = reactApplicationContext.packageManager
        val appsMap = Arguments.createMap()
        val packageSet = mutableSetOf<String>() // 用于去重
        
        // 方法1: 使用 getInstalledPackages (推荐，信息最全)
        try {
            val installedPackages = pm.getInstalledPackages(
                PackageManager.GET_META_DATA or 
                PackageManager.GET_ACTIVITIES or
                PackageManager.MATCH_UNINSTALLED_PACKAGES
            )
            
            Log.d("AccessibilityActionModule", "方法1获取到 ${installedPackages.size} 个包")
            
            for (packageInfo in installedPackages) {
                try {
                    val packageName = packageInfo.packageName
                    val appInfo = packageInfo.applicationInfo
                    
                    // 获取应用名称（处理异常情况）
                    val appName = try {
                        pm.getApplicationLabel(appInfo).toString()
                    } catch (e: Exception) {
                        packageName // 如果获取名称失败，使用包名
                    }
                    
                    // 检查应用是否有启动Activity
                    val launchIntent = pm.getLaunchIntentForPackage(packageName)
                    
                    // 如果包名未添加过，则添加
                    if (!packageSet.contains(packageName)) {
                        if (launchIntent != null) {
                            appsMap.putString(appName, packageName)
                            packageSet.add(packageName)
                        } else {
                            // 即使没有启动Activity，也记录包名（使用包名作为key）
                            appsMap.putString(packageName, packageName)
                            packageSet.add(packageName)
                        }
                    }
                } catch (e: Exception) {
                    Log.w("AccessibilityActionModule", "处理包失败: ${packageInfo.packageName}", e)
                }
            }
        } catch (e: Exception) {
            Log.w("AccessibilityActionModule", "方法1执行失败", e)
        }
        
        // 方法2: 使用 getInstalledApplications (补充方法1可能遗漏的应用)
        try {
            val installedApps = pm.getInstalledApplications(
                PackageManager.GET_META_DATA or
                PackageManager.MATCH_UNINSTALLED_PACKAGES
            )
            
            Log.d("AccessibilityActionModule", "方法2获取到 ${installedApps.size} 个应用")
            
            for (appInfo in installedApps) {
                try {
                    val packageName = appInfo.packageName
                    
                    // 如果方法1已经添加过，跳过
                    if (packageSet.contains(packageName)) {
                        continue
                    }
                    
                    // 获取应用名称
                    val appName = try {
                        pm.getApplicationLabel(appInfo).toString()
                    } catch (e: Exception) {
                        packageName
                    }
                    
                    // 检查应用是否有启动Activity
                    val launchIntent = pm.getLaunchIntentForPackage(packageName)
                    
                    if (launchIntent != null) {
                        appsMap.putString(appName, packageName)
                        packageSet.add(packageName)
                    } else {
                        // 即使没有启动Activity，也记录包名
                        appsMap.putString(packageName, packageName)
                        packageSet.add(packageName)
                    }
                } catch (e: Exception) {
                    Log.w("AccessibilityActionModule", "处理应用失败: ${appInfo.packageName}", e)
                }
            }
        } catch (e: Exception) {
            Log.w("AccessibilityActionModule", "方法2执行失败", e)
        }
        
        Log.d("AccessibilityActionModule", "最终获取到 ${packageSet.size} 个唯一应用包名")
        promise.resolve(appsMap)
        
    } catch (e: Exception) {
        Log.e("AccessibilityActionModule", "获取应用列表失败", e)
        promise.reject("ERROR", "获取应用列表失败: ${e.message}", e)
    }
}
```

## 关键特性

1. **双重获取机制**
   - 先使用 `getInstalledPackages()` 获取完整包信息
   - 再使用 `getInstalledApplications()` 补充可能遗漏的应用

2. **去重处理**
   - 使用 `Set<String>` 记录已添加的包名，避免重复

3. **异常处理**
   - 每个应用单独 try-catch，单个失败不影响整体
   - 方法1和方法2分别 try-catch，一个失败另一个仍可执行

4. **兼容性标志**
   - `MATCH_UNINSTALLED_PACKAGES`: 包含已卸载但保留数据的应用
   - `GET_META_DATA`: 获取元数据信息
   - `GET_ACTIVITIES`: 获取Activity信息

5. **启动Activity检查**
   - 优先添加有启动Activity的应用（可启动应用）
   - 即使没有启动Activity也记录包名（系统服务等）

## 适用场景
- ✅ 需要获取所有已安装应用（包括系统应用）
- ✅ 需要兼容所有 Android 版本
- ✅ 不需要外部权限或工具
- ✅ 性能要求较高的场景

## 注意事项
1. 某些厂商定制系统可能对系统应用有特殊限制
2. 如果只需要用户安装的应用，可以取消注释跳过系统应用的代码
3. 某些应用可能没有启动Activity（如输入法、壁纸等），但仍会记录包名

