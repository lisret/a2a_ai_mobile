# 方案6：通过查询权限和已安装APK获取（补充方案）

## 方案概述
通过查询应用请求的权限和扫描已安装的APK文件来获取应用列表，这种方法可以作为其他方法的补充，特别适用于某些特殊场景。

## 优势
- ✅ 可以获取到所有请求特定权限的应用
- ✅ 可以获取到系统级别的应用
- ✅ 可以提供权限信息
- ✅ 可以获取APK安装路径信息

## 劣势
- ❌ 性能较慢（需要查询权限信息）
- ❌ 需要文件系统访问权限
- ❌ 可能包含一些不应该显示的系统应用

## 实现代码

### Kotlin 原生模块实现

```kotlin
@ReactMethod
fun getAllAppsByPermissions(promise: Promise) {
    try {
        Log.d("AccessibilityActionModule", "开始通过查询权限获取所有应用")
        
        val pm = reactApplicationContext.packageManager
        val appsMap = Arguments.createMap()
        val packageSet = mutableSetOf<String>()
        
        // 方法1: 通过查询所有已安装包获取（包含权限信息）
        try {
            val installedPackages = pm.getInstalledPackages(
                PackageManager.GET_PERMISSIONS or
                PackageManager.GET_META_DATA
            )
            
            for (packageInfo in installedPackages) {
                try {
                    val packageName = packageInfo.packageName
                    val requestedPermissions = packageInfo.requestedPermissions
                    
                    // 如果有请求权限，说明这是一个应用（而不是纯数据包）
                    if (requestedPermissions != null && requestedPermissions.isNotEmpty()) {
                        if (!packageSet.contains(packageName)) {
                            val appName = try {
                                pm.getApplicationLabel(packageInfo.applicationInfo).toString()
                            } catch (e: Exception) {
                                packageName
                            }
                            
                            val launchIntent = pm.getLaunchIntentForPackage(packageName)
                            
                            if (launchIntent != null) {
                                appsMap.putString(appName, packageName)
                            } else {
                                appsMap.putString(packageName, packageName)
                            }
                            packageSet.add(packageName)
                        }
                    }
                } catch (e: Exception) {
                    // 忽略单个包
                }
            }
        } catch (e: Exception) {
            Log.w("AccessibilityActionModule", "通过权限查询失败", e)
        }
        
        // 方法2: 通过查询特定权限获取应用（补充）
        // 例如：查询所有有INTERNET权限的应用
        try {
            val internetIntent = Intent(Intent.ACTION_MAIN)
            internetIntent.addCategory(Intent.CATEGORY_LAUNCHER)
            
            val resolveInfos = pm.queryIntentActivities(internetIntent, 0)
            
            for (resolveInfo in resolveInfos) {
                try {
                    val packageName = resolveInfo.activityInfo.packageName
                    
                    if (!packageSet.contains(packageName)) {
                        val appName = try {
                            val appInfo = pm.getApplicationInfo(packageName, 0)
                            pm.getApplicationLabel(appInfo).toString()
                        } catch (e: Exception) {
                            packageName
                        }
                        
                        appsMap.putString(appName, packageName)
                        packageSet.add(packageName)
                    }
                } catch (e: Exception) {
                    // 忽略单个应用
                }
            }
        } catch (e: Exception) {
            Log.w("AccessibilityActionModule", "通过特定权限查询失败", e)
        }
        
        Log.d("AccessibilityActionModule", "通过权限查询获取到 ${packageSet.size} 个应用")
        promise.resolve(appsMap)
        
    } catch (e: Exception) {
        Log.e("AccessibilityActionModule", "通过权限查询应用列表失败", e)
        promise.reject("ERROR", "获取应用列表失败: ${e.message}", e)
    }
}

/**
 * 通过查询APK安装路径获取应用（需要文件系统访问）
 */
@ReactMethod
fun getAllAppsByAPKPaths(promise: Promise) {
    try {
        Log.d("AccessibilityActionModule", "开始通过APK路径获取所有应用")
        
        val pm = reactApplicationContext.packageManager
        val appsMap = Arguments.createMap()
        val packageSet = mutableSetOf<String>()
        
        // 查询所有已安装包，获取APK路径
        val installedPackages = pm.getInstalledPackages(
            PackageManager.GET_META_DATA or
            PackageManager.GET_ACTIVITIES
        )
        
        for (packageInfo in installedPackages) {
            try {
                val packageName = packageInfo.packageName
                val appInfo = packageInfo.applicationInfo
                
                // 获取APK路径
                val apkPath = appInfo.sourceDir
                
                // 如果APK路径存在，说明这是一个真实安装的应用
                if (apkPath != null && File(apkPath).exists()) {
                    if (!packageSet.contains(packageName)) {
                        val appName = try {
                            pm.getApplicationLabel(appInfo).toString()
                        } catch (e: Exception) {
                            packageName
                        }
                        
                        val launchIntent = pm.getLaunchIntentForPackage(packageName)
                        
                        if (launchIntent != null) {
                            appsMap.putString(appName, packageName)
                        } else {
                            appsMap.putString(packageName, packageName)
                        }
                        packageSet.add(packageName)
                    }
                }
            } catch (e: Exception) {
                // 忽略单个包
            }
        }
        
        Log.d("AccessibilityActionModule", "通过APK路径获取到 ${packageSet.size} 个应用")
        promise.resolve(appsMap)
        
    } catch (e: Exception) {
        Log.e("AccessibilityActionModule", "通过APK路径获取应用列表失败", e)
        promise.reject("ERROR", "获取应用列表失败: ${e.message}", e)
    }
}

/**
 * 获取应用权限信息（辅助方法）
 */
@ReactMethod
fun getAppPermissions(packageName: String, promise: Promise) {
    try {
        val pm = reactApplicationContext.packageManager
        val packageInfo = pm.getPackageInfo(
            packageName,
            PackageManager.GET_PERMISSIONS
        )
        
        val permissionsMap = Arguments.createMap()
        
        if (packageInfo.requestedPermissions != null) {
            for (i in packageInfo.requestedPermissions.indices) {
                val permission = packageInfo.requestedPermissions[i]
                val granted = if (i < packageInfo.requestedPermissionsFlags.size) {
                    (packageInfo.requestedPermissionsFlags[i] and 
                     PackageInfo.REQUESTED_PERMISSION_GRANTED) != 0
                } else {
                    false
                }
                
                permissionsMap.putBoolean(permission, granted)
            }
        }
        
        promise.resolve(permissionsMap)
    } catch (e: Exception) {
        Log.e("AccessibilityActionModule", "获取应用权限失败: $packageName", e)
        promise.reject("ERROR", "获取应用权限失败: ${e.message}", e)
    }
}
```

### 通过查询特定权限获取应用

```kotlin
/**
 * 获取所有请求特定权限的应用
 * @param permissionName 权限名称，如 "android.permission.INTERNET"
 */
fun getAppsByPermission(permissionName: String): List<String> {
    val pm = reactApplicationContext.packageManager
    val packages = pm.getPackagesHoldingPermissions(
        arrayOf(permissionName),
        PackageManager.GET_META_DATA
    )
    
    return packages.map { it.packageName }
}

/**
 * 获取所有请求多个权限的应用（至少请求其中一个）
 */
fun getAppsByAnyPermission(permissions: Array<String>): List<String> {
    val pm = reactApplicationContext.packageManager
    val packageSet = mutableSetOf<String>()
    
    for (permission in permissions) {
        val packages = pm.getPackagesHoldingPermissions(
            arrayOf(permission),
            PackageManager.GET_META_DATA
        )
        packages.forEach { packageSet.add(it.packageName) }
    }
    
    return packageSet.toList()
}
```

## 权限查询说明

### 常用权限
- `android.permission.INTERNET`: 网络访问权限
- `android.permission.CAMERA`: 相机权限
- `android.permission.READ_CONTACTS`: 读取联系人权限
- `android.permission.ACCESS_FINE_LOCATION`: 精确位置权限
- `android.permission.RECORD_AUDIO`: 录音权限

### 查询方法
1. **getPackagesHoldingPermissions**: 获取所有请求特定权限的应用
2. **getInstalledPackages + GET_PERMISSIONS**: 获取所有包及其权限信息
3. **checkPermission**: 检查特定应用是否有特定权限

## APK路径说明

### 常见APK路径
- `/data/app/`: 用户安装的应用
- `/system/app/`: 系统应用
- `/system/priv-app/`: 系统特权应用
- `/vendor/app/`: 厂商应用

### 获取APK信息
```kotlin
val appInfo = packageInfo.applicationInfo
val apkPath = appInfo.sourceDir // APK路径
val dataDir = appInfo.dataDir   // 数据目录
val publicSourceDir = appInfo.publicSourceDir // 公共源目录
```

## 适用场景
- ✅ 需要获取特定权限的应用（如需要网络权限的应用）
- ✅ 需要分析应用权限使用情况
- ✅ 需要获取APK安装路径信息
- ✅ 安全审计或应用分析场景

## 注意事项
1. **权限查询**: `getPackagesHoldingPermissions` 需要 Android 6.0+ (API 23+)
2. **文件访问**: 访问APK路径可能需要特殊权限
3. **性能考虑**: 查询权限信息会比较慢
4. **系统应用**: 可能包含大量系统应用，需要过滤

## 优化建议
1. **批量查询**: 一次性查询所有包及其权限信息
2. **缓存结果**: 权限信息变化不频繁，可以缓存
3. **条件过滤**: 根据需求过滤系统应用或特定类型的应用
4. **异步处理**: 如果应用数量很多，考虑异步处理

## 使用示例

```kotlin
// 获取所有有网络权限的应用
val internetApps = getAppsByPermission("android.permission.INTERNET")

// 获取所有有相机权限的应用
val cameraApps = getAppsByPermission("android.permission.CAMERA")

// 获取所有有位置权限的应用
val locationApps = getAppsByPermission("android.permission.ACCESS_FINE_LOCATION")

// 获取所有有多个权限之一的应用
val appsWithAnyPermission = getAppsByAnyPermission(arrayOf(
    "android.permission.INTERNET",
    "android.permission.CAMERA"
))
```

## 与其他方案结合

此方案最适合与其他方案结合使用：
- 作为补充方案，获取其他方法可能遗漏的应用
- 用于筛选特定类型的应用（如需要特定权限的应用）
- 提供额外的应用信息（权限、APK路径等）

