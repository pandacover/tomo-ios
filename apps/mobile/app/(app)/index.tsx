import type { AgentState } from "@tomo/shared";
import { Link, Stack } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Composer } from "@/src/components/Composer";
import { MessageList } from "@/src/components/MessageList";
import { useAssistantContext } from "@/src/lib/assistant-context";
import { colors } from "@/src/theme";

export default function ChatScreen() {
  const { agent, chat, pushNotice } = useAssistantContext();
  const state = agent.state as AgentState | undefined;
  const [input, setInput] = useState("");
  const busy = Boolean(chat.isStreaming || chat.isRecovering);

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void chat.sendMessage({ text });
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "tomo",
          headerRight: () => (
            <Link href="/(app)/settings" asChild>
              <Pressable>
                <Text style={styles.link}>Settings</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      {chat.isRecovering ? <Text style={styles.hint}>Recovering previous reply…</Text> : null}
      {pushNotice ? <Text style={styles.error}>{pushNotice}</Text> : null}
      {state?.lastPushError ? (
        <Text style={styles.error}>Notifications may not be arriving: {state.lastPushError}</Text>
      ) : null}
      {chat.status === "error" ? (
        <Text style={styles.error}>Something went wrong. Check the host and token.</Text>
      ) : null}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={88}
      >
        <View style={styles.flex}>
          <MessageList
            messages={chat.messages as never}
            onApprove={(id) => void chat.addToolApprovalResponse?.({ id, approved: true })}
            onReject={(id) => void chat.addToolApprovalResponse?.({ id, approved: false })}
          />
        </View>
        <Composer
          value={input}
          onChange={setInput}
          onSend={send}
          onStop={() => chat.stop?.()}
          busy={busy}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  link: { color: colors.accent, fontWeight: "600", paddingHorizontal: 8 },
  hint: {
    textAlign: "center",
    color: colors.muted,
    paddingVertical: 6,
    backgroundColor: colors.bgElevated,
  },
  error: {
    textAlign: "center",
    color: colors.danger,
    paddingVertical: 6,
  },
});
