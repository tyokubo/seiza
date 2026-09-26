import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';

export function DeleteConstellationDialog({ name, onCancel, onDelete }: { name: string; onCancel: () => void; onDelete: () => void }) {
  return <Modal transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="削除をキャンセル" onPress={onCancel} />
      <View style={styles.dialog} accessibilityViewIsModal>
        <ThemedText style={styles.title}>星座を削除しますか？</ThemedText>
        <ThemedText numberOfLines={3} style={styles.name}>{name}</ThemedText>
        <ThemedText style={styles.description}>空と図鑑から削除します。星の登録は残ります。この操作は取り消せません。</ThemedText>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.action}><ThemedText style={styles.name}>キャンセル</ThemedText></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="星座を削除する" onPress={onDelete} style={[styles.action, styles.remove]}><ThemedText style={styles.name}>削除する</ThemedText></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.65)' },
  dialog: { width: '100%', maxWidth: 360, borderRadius: 8, backgroundColor: '#152340', padding: 20, gap: 14 },
  title: { color: '#fff', fontSize: 19 }, name: { color: '#eff4ff', fontSize: 15 }, description: { color: '#afbed3', fontSize: 13, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }, action: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 6 },
  remove: { backgroundColor: '#9d3546' },
});
