import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import type { Note } from '../models/types';

interface Props {
  note: Note;
}

export function NoteCard({ note }: Props) {
  const time = new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={styles.card}>
      <Text style={styles.content}>{note.content}</Text>
      <Text style={styles.meta}>{note.authorName} · {time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    backgroundColor: '#fffde7',
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.orange,
    marginBottom: spacing.sm,
  },
  content: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  meta: { fontSize: fontSize.xs, color: colors.textLight, marginTop: spacing.sm },
});
