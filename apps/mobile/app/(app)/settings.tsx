import { type AgentState, CHAT_MODEL_ALLOWLIST } from "@tomo/shared";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAssistantContext } from "@/src/lib/assistant-context";
import { useAuth } from "@/src/lib/auth-context";
import { colors } from "@/src/theme";

export default function SettingsScreen() {
  const { agent, chat } = useAssistantContext();
  const { signOut } = useAuth();
  const state = (agent.state ?? {}) as Partial<AgentState>;
  const [name, setName] = useState(state.prefs?.name ?? "");
  const selectedModel = state.prefs?.model ?? CHAT_MODEL_ALLOWLIST[0];

  const stub = agent as {
    stub?: {
      updatePrefs?: (patch: { name?: string; model?: string }) => Promise<unknown>;
    };
  };

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    void stub.stub?.updatePrefs?.({ name: trimmed });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Settings" }} />

      <Text style={styles.label}>Your name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        onEndEditing={saveName}
        placeholder="What should tomo call you?"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />

      <Text style={styles.label}>Chat model</Text>
      {CHAT_MODEL_ALLOWLIST.map((id) => (
        <Pressable
          key={id}
          onPress={() => void stub.stub?.updatePrefs?.({ model: id })}
          style={[styles.option, selectedModel === id && styles.optionOn]}
        >
          <Text style={styles.optionText}>{id}</Text>
        </Pressable>
      ))}

      <Text style={styles.label}>Reminders</Text>
      {(state.reminders ?? []).length === 0 ? (
        <Text style={styles.muted}>None scheduled.</Text>
      ) : (
        (state.reminders ?? []).map((reminder) => (
          <View key={reminder.id} style={styles.card}>
            <Text style={styles.body}>{reminder.text}</Text>
            <Text style={styles.muted}>{new Date(reminder.dueAt).toLocaleString()}</Text>
          </View>
        ))
      )}
      {state.lastPushError ? (
        <Text style={styles.error}>Notifications may not be arriving: {state.lastPushError}</Text>
      ) : null}

      <Pressable style={styles.secondary} onPress={() => void chat.clearHistory?.()}>
        <Text style={styles.secondaryLabel}>Clear chat history</Text>
      </Pressable>
      <Pressable
        style={styles.danger}
        onPress={async () => {
          await signOut();
          router.replace("/setup");
        }}
      >
        <Text style={styles.dangerLabel}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  label: { color: colors.muted, marginTop: 12, fontSize: 13, textTransform: "uppercase" },
  input: {
    backgroundColor: colors.bgElevated,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
  optionOn: { borderColor: colors.accent },
  optionText: { color: colors.text },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  body: { color: colors.text, fontSize: 16 },
  muted: { color: colors.muted },
  error: { color: colors.danger },
  secondary: {
    marginTop: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    alignItems: "center",
  },
  secondaryLabel: { color: colors.text, fontWeight: "600" },
  danger: {
    borderRadius: 12,
    backgroundColor: colors.danger,
    padding: 14,
    alignItems: "center",
  },
  dangerLabel: { color: colors.bg, fontWeight: "700" },
});
