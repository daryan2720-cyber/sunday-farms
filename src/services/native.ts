/**
 * Native phone features, all through Expo modules that work in Expo Go and in builds made
 * with `expo prebuild`. Each call fails softly so a missing feature never crashes the app.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Print from 'expo-print';
import * as ScreenCapture from 'expo-screen-capture';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

// ---------------------------------------------------------------- biometrics

/** True if the phone has Face ID / Touch ID / fingerprint set up. */
export async function biometricsAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

/** Shows the system Face ID / fingerprint prompt. Falls back to the phone passcode if needed. */
export async function authenticate(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: reason });
    return result.success;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- screenshots

/** Blocks screenshots and screen recording on login, sign-up, reset and payment screens. */
export async function setScreenshotsBlocked(blocked: boolean): Promise<void> {
  try {
    if (blocked) await ScreenCapture.preventScreenCaptureAsync('sensitive');
    else await ScreenCapture.allowScreenCaptureAsync('sensitive');
  } catch {
    // Not supported on this device; nothing to do.
  }
}

// ---------------------------------------------------------------- photos

/**
 * Takes a photo (or picks one) and saves a re-encoded copy. Re-encoding drops all EXIF
 * metadata, including GPS location, so a journal photo can't reveal where the user lives.
 */
export async function takePhoto(fromLibrary = false): Promise<string | null> {
  try {
    let result: ImagePicker.ImagePickerResult;
    if (fromLibrary) {
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
    } else {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return null;
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
    }
    if (result.canceled || !result.assets?.length) return null;
    const context = ImageManipulator.ImageManipulator.manipulate(result.assets[0].uri);
    context.resize({ width: 1280 });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
    return saved.uri;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- reminders

type NotificationsModule = typeof import('expo-notifications');
let notificationsModule: NotificationsModule | null = null;
let notificationsReady = false;

/**
 * Loaded only when a reminder is first scheduled, so Expo Go doesn't log its
 * "remote push isn't available" notice at app start. Local reminders work in Expo Go.
 */
function notifications(): NotificationsModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!notificationsModule) notificationsModule = require('expo-notifications') as NotificationsModule;
  return notificationsModule;
}

async function prepareNotifications(): Promise<boolean> {
  const Notifications = notifications();
  if (!notificationsReady) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('care', { name: 'Plant care reminders', importance: Notifications.AndroidImportance.DEFAULT });
    }
    notificationsReady = true;
  }
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Repeating local "time to water" notification. Returns its id, or null if not allowed. */
export async function scheduleReminder(title: string, body: string, everyDays: number): Promise<string | null> {
  try {
    if (!(await prepareNotifications())) return null;
    const Notifications = notifications();
    return await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, everyDays) * 86400,
        repeats: true,
        channelId: 'care',
      },
    });
  } catch {
    return null;
  }
}

export async function cancelReminder(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await notifications().cancelScheduledNotificationAsync(id);
  } catch {
    // Already gone.
  }
}

// ---------------------------------------------------------------- sharing

export async function shareText(message: string): Promise<void> {
  try {
    await Share.share({ message });
  } catch {
    // User closed the share sheet.
  }
}

/** Renders HTML to a PDF on the phone and opens the share sheet (save, print or send). */
export async function sharePdf(html: string, title: string): Promise<boolean> {
  try {
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
      return true;
    }
  } catch {
    // Fall through.
  }
  return false;
}
