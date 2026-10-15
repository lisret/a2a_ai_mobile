import {NativeModules, Platform} from 'react-native';

type OwnershipModule = {
  acquireLocalControl(owner: string): Promise<boolean>;
  releaseLocalControl(owner: string): Promise<void>;
};

// Builds without the MCP module cannot run the remote controller. No lease is needed there.
export async function acquireLocalDeviceControl(
  owner: string,
): Promise<(() => Promise<void>) | null> {
  const native: OwnershipModule | undefined =
    Platform.OS === 'android' ? NativeModules.LanMcpModule : undefined;
  if (!native) return async () => {};
  if (!(await native.acquireLocalControl(owner))) return null;
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await native.releaseLocalControl(owner);
  };
}
