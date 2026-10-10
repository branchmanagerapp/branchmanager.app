import React from 'react';
import { Image, TouchableOpacity, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';
import type { Photo } from '../models/types';

interface Props {
  photo: Photo;
  size?: number;
  onPress?: () => void;
}

export function PhotoThumbnail({ photo, size = 64, onPress }: Props) {
  return (
    <TouchableOpacity
      style={[styles.wrap, { width: size, height: size }]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      {photo.uri ? (
        <Image source={{ uri: photo.uri }} style={styles.image} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>📷</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  placeholderText: { fontSize: 24 },
});
