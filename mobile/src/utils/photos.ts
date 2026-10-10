/**
 * Photo capture and selection utility
 * Uses expo-image-picker for camera + gallery
 */
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

export interface CapturedPhoto {
  uri: string;
  width: number;
  height: number;
  base64?: string;
}

export async function takePhoto(): Promise<CapturedPhoto | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission Required', 'Camera access is needed to take photos.');
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  return {
    uri: result.assets[0].uri,
    width: result.assets[0].width,
    height: result.assets[0].height,
  };
}

export async function pickPhoto(): Promise<CapturedPhoto | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission Required', 'Photo library access is needed.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  return {
    uri: result.assets[0].uri,
    width: result.assets[0].width,
    height: result.assets[0].height,
  };
}

export async function pickOrTakePhoto(): Promise<CapturedPhoto | null> {
  return new Promise(resolve => {
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Camera', onPress: async () => resolve(await takePhoto()) },
      { text: 'Photo Library', onPress: async () => resolve(await pickPhoto()) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}
