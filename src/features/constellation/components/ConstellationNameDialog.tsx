import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { gameConfig } from '@/config/gameConfig';
import { normalizeConstellationName } from '../domain/saveData';

export function ConstellationNameDialog({ name, onSave, onClose, complete = false }: {
  name: string; onSave: (name: string) => void; onClose: () => void; complete?: boolean;
}) {
  const [value, setValue] = useState(name);
  const normalized = normalizeConstellationName(value);
  const save = () => { if (normalized) { onSave(normalized); onClose(); } };
  return <Modal transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="名前の編集を閉じる" onPress={onClose} />
      <View style={styles.dialog}>
        <ThemedText type="subtitle" style={styles.title}>星座の名前</ThemedText>
        <TextInput accessibilityLabel="星座の名前" autoFocus value={value} onChangeText={setValue}
          placeholder="名前を入力" placeholderTextColor="#83959d" maxLength={gameConfig.constellationEditor.maxNameLength}
          returnKeyType="done" onSubmitEditing={save} style={styles.input} selectTextOnFocus />
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.action}>
            <ThemedText style={styles.cancel}>キャンセル</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={complete ? '星座を保存' : '名前を決定'} disabled={!normalized}
            accessibilityState={{ disabled: !normalized }} onPress={save} style={[styles.action, styles.save, !normalized && styles.disabled]}>
            <ThemedText type="smallBold" style={styles.saveText}>{complete ? '完成・保存' : '決定'}</ThemedText>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.65)' },
  dialog: { width: '100%', maxWidth: 360, backgroundColor: '#12212a', borderRadius: 8, padding: 20, gap: 20 },
  title: { color: '#eff9ff', fontSize: 20 },
  input: { height: 48, borderWidth: 1, borderColor: '#718c97', borderRadius: 6, paddingHorizontal: 12, color: '#ffffff', fontSize: 17 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  action: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 6 },
  cancel: { color: '#c0ced4', fontSize: 14 },
  save: { backgroundColor: '#c4e7eb' },
  saveText: { color: '#14212b' },
  disabled: { opacity: 0.4 },
});
