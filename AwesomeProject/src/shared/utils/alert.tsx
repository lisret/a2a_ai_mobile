import React, { useState, useCallback } from 'react';
import { CustomAlert, AlertButton } from '../components/CustomAlert';

interface AlertState {
  id: number;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onDismiss?: () => void;
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
  options?: { onDismiss?: () => void }
): void => {
  if (alertStateSetter) {
    const id = alertIdCounter++;
    alertStateSetter({
      id,
      title,
      message,
      buttons: buttons || [{ text: '确定' }],
      onDismiss: options?.onDismiss,
    });
  } else {
    console.warn('AlertProvider未初始化，请确保在AppNavigator中使用AlertProvider');
  }
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
          onDismiss={handleDismiss}
        />
      )}
    </>
  );
};
