import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@/src/theme";

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
}) {
  return (
    <View style={styles.row}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Message tomo"
        placeholderTextColor={colors.muted}
        style={styles.input}
        multiline
        editable={!busy}
        onSubmitEditing={onSend}
      />
      <Pressable
        onPress={busy ? onStop : onSend}
        style={[styles.button, busy ? styles.stop : styles.send]}
        disabled={!busy && value.trim().length === 0}
      >
        <Text style={styles.buttonLabel}>{busy ? "Stop" : "Send"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    color: colors.text,
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  button: {
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  send: { backgroundColor: colors.accent },
  stop: { backgroundColor: colors.danger },
  buttonLabel: { color: colors.bg, fontWeight: "700" },
});
