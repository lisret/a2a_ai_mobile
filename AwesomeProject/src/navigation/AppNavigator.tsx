import React, { useEffect, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeIcon, CapabilitiesIcon, HistoryIcon, SettingsIcon } from '../shared/components/TabIcons';
import { CustomTabBar } from './CustomTabBar';
import type { RootStackParamList, MainTabParamList } from '../shared/types/navigation';
import { CapabilitiesScreen } from '../features/capability/screens/CapabilitiesScreen';
import { PhoneOperateScreen } from '../features/capability/screens/PhoneOperateScreen';
import { VisualAgentToolsScreen } from '../features/capability/screens/VisualAgentToolsScreen';
import { OpenClawScreen } from '../features/capability/screens/OpenClawScreen';
import { ErrandsScreen } from '../features/capability/screens/ErrandsScreen';
import { PrivacyScreen } from '../features/capability/screens/PrivacyScreen';
import { ErrandDetailScreen } from '../features/capability/screens/ErrandDetailScreen';
import { CompanionConfigScreen } from '../features/settings/screens/CompanionConfigScreen';
import { AvatarLooksScreen } from '../features/settings/screens/AvatarLooksScreen';
import { AboutScreen } from '../features/settings/screens/AboutScreen';
import { AddModelScreen } from '../features/model/screens/AddModelScreen';
import { EditModelScreen } from '../features/model/screens/EditModelScreen';
import { TaskHistoryScreen } from '../features/task/screens/TaskHistoryScreen';
import { TaskHistoryScreenTab } from '../features/task/screens/TaskHistoryScreenTab';
import { TaskDetailScreen } from '../features/task/screens/TaskDetailScreen';
import { HomeScreen } from '../features/task/screens/HomeScreen';
import { SettingsScreen } from '../features/settings/screens/SettingsScreen';
import { APIKeyGuideScreen } from '../features/settings/screens/APIKeyGuideScreen';
import { DebugLogScreen } from '../features/debug/screens/DebugLogScreen';
import { AlertProvider } from '../shared/utils/alert';
import {
  maybeRequestOperatePermissionsOnLaunch,
  subscribeOperatePermissionStatus,
} from '../features/capability/services/operatePermissions';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabs = () => {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: '首页',
          tabBarIcon: ({ color }) => (
            <HomeIcon color={color} size={24} />
          ),
        }}
      />
      <Tab.Screen
        name="Capabilities"
        component={CapabilitiesScreen}
        options={{
          tabBarLabel: '能力',
          tabBarIcon: ({ color }) => (
            <CapabilitiesIcon color={color} size={24} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={TaskHistoryScreenTab}
        options={{
          tabBarLabel: '活动',
          tabBarIcon: ({ color }) => (
            <HistoryIcon color={color} size={24} />
          ),
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
  const lastPermissionCheckTimeRef = useRef<number>(0);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    maybeRequestOperatePermissionsOnLaunch();

    const subscription = AppState.addEventListener(
      'change',
      async (nextAppState: AppStateStatus) => {
        const previousAppState = appStateRef.current;
        appStateRef.current = nextAppState;

        if (nextAppState === 'active' && previousAppState === 'background') {
          const now = Date.now();
          if (now - lastPermissionCheckTimeRef.current > 5000) {
            lastPermissionCheckTimeRef.current = now;
            await maybeRequestOperatePermissionsOnLaunch();
          }
        }
      },
    );

    const unsubscribe = subscribeOperatePermissionStatus();

    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, []);

  return (
    <AlertProvider>
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="AddModel" component={AddModelScreen} />
        <Stack.Screen name="EditModel" component={EditModelScreen} />
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
        <Stack.Screen name="DebugLog" component={DebugLogScreen} />
        <Stack.Screen name="PhoneOperate" component={PhoneOperateScreen} />
        <Stack.Screen name="VisualAgentTools" component={VisualAgentToolsScreen} />
        <Stack.Screen name="OpenClaw" component={OpenClawScreen} />
        <Stack.Screen name="Errands" component={ErrandsScreen} />
        <Stack.Screen name="Privacy" component={PrivacyScreen} />
        <Stack.Screen name="CompanionConfig" component={CompanionConfigScreen} />
        <Stack.Screen name="AvatarLooks" component={AvatarLooksScreen} />
        <Stack.Screen name="ErrandDetail" component={ErrandDetailScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
      </Stack.Navigator>
    </NavigationContainer>
    </AlertProvider>
  );
};
