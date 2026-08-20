import React, { useState, useCallback } from 'react';
import { CustomAlert, AlertButton } from '../components/CustomAlert';

interface AlertOptions {
  onDismiss?: () => void;
  loading?: boolean;
  dismissable?: boolean;
}

interface AlertState {
  id: number;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onDismiss?: () => void;
  loading?: boolean;
  dismissable?: boolean;
}

let alertIdCounter = 0;
let alertStateSetter: ((state: AlertState | null) => void) | null = null;

/**
 * 显示自定义Alert，API与React Native的Alert.alert保持一致
 */
export const showCustomAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions
): void => {
  if (alertStateSetter) {
    const id = alertIdCounter++;
    alertStateSetter({
      id,
      title,
      message,
      buttons: options?.loading ? buttons ?? [] : buttons || [{ text: '确定' }],
      onDismiss: options?.onDismiss,
      loading: options?.loading,
      dismissable: options?.dismissable,
    });
  } else {
    console.warn('AlertProvider未初始化，请确保在AppNavigator中使用AlertProvider');
  }
};

export const hideCustomAlert = (): void => {
  alertStateSetter?.(null);
};

/**
 * Alert Provider组件，需要在AppNavigator中使用
 */
export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alertState, setAlertState] = useState<AlertState | null>(null);

  React.useEffect(() => {
    alertStateSetter = setAlertState;
    return () => {
      alertStateSetter = null;
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setAlertState(null);
    alertState?.onDismiss?.();
  }, [alertState]);

  return (
    <>
      {children}
      {alertState && (
        <CustomAlert
          visible={true}
          title={alertState.title}
          message={alertState.message}
          buttons={alertState.buttons}
          loading={alertState.loading}
          dismissable={alertState.dismissable}
          onDismiss={handleDismiss}
        />
      )}
    </>
  );
};
