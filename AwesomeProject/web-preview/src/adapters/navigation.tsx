import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {View} from 'react-native-web';

const tabs = ['Home', 'Capabilities', 'History', 'Settings'];
type Route = {name: string; key: string; params?: Record<string, any>};
const Context = createContext<any>(null);
const initial = () => {
  const name = new URLSearchParams(location.search).get('page') ?? 'Home';
  return tabs.includes(name)
    ? []
    : [{name, key: name, params: defaultParams(name)}];
};
export function defaultParams(name: string) {
  if (name === 'TaskDetail') return {taskId: 'preview-task-success'};
  if (name === 'TaskHistory') return {modelId: 'preview-unified'};
  if (name === 'ErrandDetail')
    return {errandId: 'preview-errand', id: 'preview-errand'};
  if (name === 'EditModel')
    return {list: 'companion', bindingId: 'preview-companion'};
  if (name === 'AddModel') return {list: 'companion'};
  if (name === 'APIKeyGuide')
    return {presetId: 'openai', provider: 'OpenAI', providerId: 'openai'};
  return {};
}
export function NavigationContainer({children}: any) {
  const [stack, setStack] = useState<Route[]>(initial);
  const [tab, setTab] = useState(() => {
    const page = new URLSearchParams(location.search).get('page');
    return page && tabs.includes(page) ? page : 'Home';
  });
  const navigate = useCallback((name: string, params?: Record<string, any>) => {
    if (tabs.includes(name)) {
      setTab(name);
      setStack([]);
    } else if (name === 'MainTabs') setStack([]);
    else
      setStack(current => [
        ...current,
        {
          name,
          key: name + '-' + Date.now(),
          params: params ?? defaultParams(name),
        },
      ]);
  }, []);
  const goBack = useCallback(
    () => setStack(current => current.slice(0, -1)),
    [],
  );
  const route = stack[stack.length - 1] ?? {name: tab, key: tab, params: {}};
  const navigation = useMemo(
    () => ({
      navigate,
      goBack,
      push: navigate,
      replace: (name: string, params?: any) =>
        setStack(current => [
          ...current.slice(0, -1),
          {name, key: name, params: params ?? defaultParams(name)},
        ]),
      canGoBack: () => stack.length > 0,
      setOptions() {},
      emit: () => ({defaultPrevented: false}),
      addListener: (event: string, callback: Function) => {
        if (event === 'focus') callback();
        return () => {};
      },
    }),
    [navigate, goBack, stack.length],
  );
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      navigate(detail.name, detail.params);
    };
    window.addEventListener('nono-preview:navigate', handler);
    return () => window.removeEventListener('nono-preview:navigate', handler);
  }, [navigate]);
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('nono-preview:route', {detail: route.name}),
    );
  }, [route.name]);
  const value = useMemo(
    () => ({stack, tab, route, navigation}),
    [stack, tab, route.name, navigation],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useNavigation = <T,>(): T => useContext(Context).navigation;
export const useRoute = <T,>(): T => useContext(Context).route;
export const useIsFocused = () => true;
export function useFocusEffect(callback: () => void | (() => void)) {
  const {route} = useContext(Context);
  useEffect(callback, [callback, route.name]);
}
function Screen() {
  return null;
}
function createNavigator(kind: 'stack' | 'tab') {
  function Navigator({children, tabBar}: any) {
    const ctx = useContext(Context);
    const entries = React.Children.toArray(
      children,
    ) as React.ReactElement<any>[];
    const selected =
      kind === 'stack' ? ctx.stack.at(-1)?.name ?? 'MainTabs' : ctx.tab;
    const screen = entries.find(entry => entry.props.name === selected);
    if (!screen)
      return (
        <View>
          <span>预览路由不存在：{selected}</span>
        </View>
      );
    const Component = screen.props.component;
    const routes = entries.map(entry => ({
      name: entry.props.name,
      key: entry.props.name,
      params: {},
    }));
    const descriptors = Object.fromEntries(
      entries.map(entry => [
        entry.props.name,
        {options: entry.props.options ?? {}},
      ]),
    );
    return (
      <View style={{flex: 1, minHeight: 0}}>
        <Component
          key={selected}
          navigation={ctx.navigation}
          route={ctx.route}
        />
        {kind === 'tab' &&
          tabBar?.({
            state: {
              routes,
              index: routes.findIndex(route => route.name === selected),
            },
            descriptors,
            navigation: ctx.navigation,
          })}
      </View>
    );
  }
  return {Navigator, Screen};
}
export const createNativeStackNavigator = <T,>() => createNavigator('stack');
export const createBottomTabNavigator = <T,>() => createNavigator('tab');
