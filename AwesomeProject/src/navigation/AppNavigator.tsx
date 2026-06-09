import React, { useEffect, useState, useRef } from 'react';
import { TouchableOpacity, Alert, Platform, AppState, AppStateStatus } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AppIcon, IconNames } from '../shared/components/Icon';
import { HomeIcon, ModelsIcon, HistoryIcon, SettingsIcon } from '../shared/components/TabIcons';
import { CustomTabBar } from './CustomTabBar';
import type { RootStackParamList, MainTabParamList } from '../shared/types/navigation';
import { ModelListScreen } from '../features/model/screens/ModelListScreen';
import { AddModelScreen } from '../features/model/screens/AddModelScreen';
import { EditModelScreen } from '../features/model/screens/EditModelScreen';
import { TaskHistoryScreen } from '../features/task/screens/TaskHistoryScreen';
import { TaskHistoryScreenTab } from '../features/task/screens/TaskHistoryScreenTab';
import { TaskDetailScreen } from '../features/task/screens/TaskDetailScreen';
import { HomeScreen } from '../features/task/screens/HomeScreen';
import { SettingsScreen } from '../features/settings/screens/SettingsScreen';
import { APIKeyGuideScreen } from '../features/settings/screens/APIKeyGuideScreen';
import { DebugLogScreen } from '../features/debug/screens/DebugLogScreen';
import { modelService } from '../features/model/services/ModelService';
import { accessibilityService } from '../core/ability';
import { permissionService, PermissionStatus } from '../shared/services/PermissionService';
import { AlertProvider } from '../shared/utils/alert';
import type { AIModel } from '../shared/types/Model';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabs = () => {
  const [hasActiveModel, setHasActiveModel] = useState<boolean | null>(null); // null表示初始化未完成

  useEffect(() => {
    checkActiveModel();
    // 监听模型变化
    const interval = setInterval(checkActiveModel, 2000);
    return () => clearInterval(interval);
  }, []);

  const checkActiveModel = async () => {
    try {
      const selectedModel = await modelService.getSelectedModel();
      // 如果没有模型，或者选中的模型不可用，都视为无激活模型
      setHasActiveModel(!!selectedModel);
    } catch (error) {
      console.error('检查模型状态失败:', error);
      setHasActiveModel(false); // 出错时默认为无模型
    }
  };

  // 等待初始化完成
  if (hasActiveModel === null) {
    return null; // 或者显示加载动画
  }

  return (
    <Tab.Navigator
      initialRouteName={hasActiveModel ? "Home" : "Models"}
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: '首页',
          tabBarIcon: ({ color }) => (
            <HomeIcon color={color} size={24} />
          ),
          tabBarItemStyle: !hasActiveModel ? { opacity: 0.4 } : undefined,
          tabBarButton: !hasActiveModel
            ? (props) => (
                <TouchableOpacity
                  {...props}
                  disabled={true}
                  style={[props.style, { opacity: 0.4 }]}
                />
              )
            : undefined,
        }}
      />
      <Tab.Screen
        name="Models"
        component={ModelListScreen}
        options={{
          tabBarLabel: '模型',
          tabBarIcon: ({ color }) => (
            <ModelsIcon color={color} size={24} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={TaskHistoryScreenTab}
        options={{
          tabBarLabel: '历史',
          tabBarIcon: ({ color }) => (
            <HistoryIcon color={color} size={24} />
          ),
          tabBarItemStyle: !hasActiveModel ? { opacity: 0.4 } : undefined,
          tabBarButton: !hasActiveModel
            ? (props) => (
                <TouchableOpacity
                  {...props}
                  disabled={true}
                  style={[props.style, { opacity: 0.4 }]}
                />
              )
            : undefined,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: '设置',
          tabBarIcon: ({ color }) => (
            <SettingsIcon color={color} size={24} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

export const AppNavigator: React.FC = () => {
  const appStateRef = useRef(AppState.currentState);
  const isCheckingRef = useRef(false); // 防止重复检查
  const hasCheckedNotificationPermissionRef = useRef(false); // 跟踪是否已检查过通知权限
  const lastPermissionCheckTimeRef = useRef<number>(0); // 上次检查权限的时间
  const hasShownPermissionAlertRef = useRef(false); // 是否已显示过权限提示
  const permissionWasGrantedRef = useRef(false); // 权限是否曾经被授予过

  useEffect(() => {
    // 仅在 Android 平台检查权限
    if (Platform.OS === 'android') {
      // 初始化：检查权限是否曾经被授予过
      const initPermissionCheck = async () => {
        const wasGranted = await permissionService.hasPermissionBeenGranted(
          'android.permission.BIND_ACCESSIBILITY_SERVICE'
        );
        permissionWasGrantedRef.current = wasGranted;
        
        // 如果权限曾经被授予过，静默检查（不弹窗）
        if (wasGranted) {
          console.info('[AppNavigator] 权限曾经被授予过，静默检查状态');
          await checkAccessibilityPermission(true); // 静默检查
        } else {
          // 如果权限从未被授予过，正常检查（可能弹窗）
          await checkAccessibilityPermission(false);
        }
        
        await checkNotificationPermission();
      };
      
      initPermissionCheck();
      
      // 监听 AppState 变化，当应用从后台返回前台时再次检查
      const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
        const previousAppState = appStateRef.current;
        appStateRef.current = nextAppState;
        
        // 从后台返回前台时，检查权限状态
        if (nextAppState === 'active' && previousAppState === 'background') {
          const now = Date.now();
          // 避免频繁检查（至少间隔5秒）
          if (now - lastPermissionCheckTimeRef.current > 5000) {
            lastPermissionCheckTimeRef.current = now;
            
            // 如果权限曾经被授予过，静默检查
            if (permissionWasGrantedRef.current) {
              await checkAccessibilityPermission(true); // 静默检查
            } else {
              await checkAccessibilityPermission(false);
            }
            
            // 通知权限通常不需要重复检查
            if (!hasCheckedNotificationPermissionRef.current) {
              checkNotificationPermission();
            }
          }
        }
      });
      
      // 注册权限状态变化监听
      const unsubscribe = permissionService.onPermissionStatusChange(
        'android.permission.BIND_ACCESSIBILITY_SERVICE',
        (status) => {
          if (status === PermissionStatus.GRANTED) {
            permissionWasGrantedRef.current = true;
            hasShownPermissionAlertRef.current = false; // 重置提示标记
            console.info('[AppNavigator] 检测到权限已授予');
          } else if (status === PermissionStatus.DENIED && permissionWasGrantedRef.current) {
            // 权限被关闭了，需要提示用户
            console.warn('[AppNavigator] 检测到权限被关闭');
            hasShownPermissionAlertRef.current = false; // 重置提示标记，允许再次提示
          }
        }
      );
      
      return () => {
        subscription.remove();
        unsubscribe();
      };
    }
  }, []);

  const checkAccessibilityPermission = async (silent: boolean = false) => {
    // 防止重复检查
    if (isCheckingRef.current) {
      return;
    }
    
    try {
      isCheckingRef.current = true;
      
      // 使用PermissionService检查权限（会自动更新持久化存储）
      const checkResult = await permissionService.checkPermission(
        'android.permission.BIND_ACCESSIBILITY_SERVICE'
      );
      
      const isEnabled = checkResult.status === PermissionStatus.GRANTED;
      
      if (!isEnabled) {
        // 如果权限曾经被授予过，说明是被系统关闭了
        const wasGranted = permissionWasGrantedRef.current;
        
        // 静默检查时不弹窗，除非权限被关闭了
        if (silent && !wasGranted) {
          isCheckingRef.current = false;
          return;
        }
        
        // 避免重复弹窗（如果已经显示过且权限状态没变化）
        if (hasShownPermissionAlertRef.current && wasGranted) {
          isCheckingRef.current = false;
          return;
        }
        
        // 延迟显示，确保导航已初始化
        setTimeout(() => {
          hasShownPermissionAlertRef.current = true;
          
          const message = wasGranted
            ? '检测到无障碍服务被关闭。\n\n可能是系统自动关闭的（某些定制系统会定期清理未使用的无障碍服务）。\n\n为了正常使用自动化功能，请重新开启无障碍服务。\n\n开启步骤：\n1. 点击"去开启"按钮\n2. 在设置中找到本应用\n3. 开启无障碍服务开关\n4. 返回应用即可使用'
            : '为了正常使用自动化功能，请先开启无障碍服务。\n\n开启步骤：\n1. 点击"去开启"按钮\n2. 在设置中找到本应用\n3. 开启无障碍服务开关\n4. 返回应用即可使用\n\n应用需要无障碍权限来：\n• 获取屏幕截图\n• 执行点击、滑动等操作\n• 启动其他应用';
          
          Alert.alert(
            '需要无障碍权限',
            message,
            [
              {
                text: '去开启',
                onPress: async () => {
                  await accessibilityService.openSettings().catch(error => {
                    console.error('打开无障碍设置失败:', error);
                  });
                  
                  // 使用AppState监听用户返回，更准确
                  let checkCount = 0;
                  const maxChecks = 30; // 最多检查30次（30秒）
                  
                  const checkPermissionOnReturn = async () => {
                    checkCount++;
                    if (checkCount > maxChecks) {
                      return; // 超时停止检查
                    }
                    
                    const result = await permissionService.checkPermission(
                      'android.permission.BIND_ACCESSIBILITY_SERVICE'
                    );
                    
                    if (result.status === PermissionStatus.GRANTED) {
                      // 权限已开启
                      Alert.alert('✅ 成功', '无障碍服务已开启！您现在可以使用自动化功能了。');
                      permissionWasGrantedRef.current = true;
                      hasShownPermissionAlertRef.current = false;
                      isCheckingRef.current = false;
                    } else {
                      // 继续等待用户返回
                      setTimeout(checkPermissionOnReturn, 1000);
                    }
                  };
                  
                  // 监听应用状态变化，用户返回时立即检查
                  const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
                    if (nextAppState === 'active') {
                      // 用户返回应用，立即检查
                      await checkPermissionOnReturn();
                      subscription.remove();
                    }
                  });
                  
                  // 如果用户没有返回，也定期检查（防止监听失效）
                  setTimeout(checkPermissionOnReturn, 2000);
                },
              },
              {
                text: '稍后',
                style: 'cancel',
                onPress: () => {
                  isCheckingRef.current = false; // 允许稍后再次检查
                },
              },
            ],
            {
              onDismiss: () => {
                isCheckingRef.current = false; // 允许稍后再次检查
              },
            }
          );
        }, 500);
      } else {
        // 权限已启用
        permissionWasGrantedRef.current = true;
        hasShownPermissionAlertRef.current = false; // 重置提示标记
        isCheckingRef.current = false;
      }
    } catch (error) {
      console.error('检查无障碍权限失败:', error);
      isCheckingRef.current = false; // 出错时重置标记
    }
  };

  const checkNotificationPermission = async () => {
    // 防止重复检查
    if (hasCheckedNotificationPermissionRef.current) {
      return;
    }
    
    try {
      // 检查通知权限（Android 13+）
      const hasPermission = await accessibilityService.hasNotificationPermission();
      
      if (!hasPermission) {
        hasCheckedNotificationPermissionRef.current = true; // 标记已检查
        // 延迟显示，确保导航已初始化
        setTimeout(() => {
          Alert.alert(
            '需要通知权限',
            '为了正常接收任务完成通知，请开启通知权限。\n\n应用需要通知权限来：\n• 显示任务完成通知\n• 在通知栏显示任务执行状态\n• 及时提醒您任务进度',
            [
              {
                text: '去开启',
                onPress: async () => {
                  try {
                    // 先尝试请求权限
                    await accessibilityService.requestNotificationPermission();
                    // 等待一小段时间后检查权限状态
                    setTimeout(async () => {
                      const hasPermissionNow = await accessibilityService.hasNotificationPermission();
                      if (!hasPermissionNow) {
                        // 如果仍未授予，打开设置页面
                        await accessibilityService.openNotificationSettings();
                      }
                    }, 500);
                  } catch (error) {
                    console.error('请求通知权限失败:', error);
                    // 如果请求失败，直接打开设置页面
                    accessibilityService.openNotificationSettings().catch(err => {
                      console.error('打开通知设置失败:', err);
                    });
                  }
                },
              },
              {
                text: '稍后',
                style: 'cancel',
                onPress: () => {
                  hasCheckedNotificationPermissionRef.current = false; // 允许稍后再次检查
                },
              },
            ],
            {
              onDismiss: () => {
                hasCheckedNotificationPermissionRef.current = false; // 允许稍后再次检查
              },
            }
          );
        }, 1000); // 延迟1秒，避免与无障碍权限提示冲突
      } else {
        hasCheckedNotificationPermissionRef.current = true; // 已授予，标记已检查
        console.info('[AppNavigator] 通知权限已授予');
      }
    } catch (error) {
      console.error('检查通知权限失败:', error);
      hasCheckedNotificationPermissionRef.current = true; // 出错时也标记已检查，避免重复
    }
  };

  return (
    <AlertProvider>
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen
          name="AddModel"
          component={AddModelScreen}
          options={{ 
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            headerShown: false 
          }}
        />
        <Stack.Screen
          name="EditModel"
          component={EditModelScreen}
          options={{ 
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            headerShown: false 
          }}
        />
        <Stack.Screen
          name="TaskHistory"
          component={TaskHistoryScreen}
        />
        <Stack.Screen
          name="TaskDetail"
          component={TaskDetailScreen}
        />
        <Stack.Screen
          name="APIKeyGuide"
          component={APIKeyGuideScreen}
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="DebugLog"
          component={DebugLogScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
    </AlertProvider>
  );
};
