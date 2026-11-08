import { Alert, Platform } from 'react-native';

// react-native-web's Alert.alert is a no-op, so on Expo web any action gated
// behind a native alert would silently do nothing. Use the browser dialogs there.

export function confirmAction({
  title,
  message,
  confirmText,
  cancelText = 'Cancel',
  destructive = false,
}: {
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
