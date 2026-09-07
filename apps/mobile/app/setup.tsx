import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/lib/auth-context";
import { colors } from "@/src/theme";

export default function SetupScreen() {
  const { save } = useAuth();
  const [host, setHost] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onConnect = async () => {
    setSaving(true);
    setError(null);
    try {
      await save({ host, token });
      router.replace("/(app)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save credentials");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>tomo</Text>
      <Text style={styles.sub}>Personal assistant. One Worker, one phone.</Text>
      <TextInput
        value={host}
        onChangeText={setHost}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="tomo-agent.<account>.workers.dev"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <TextInput
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="App token"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={onConnect} style={styles.button} disabled={saving}>
        <Text style={styles.buttonLabel}>{saving ? "Saving…" : "Connect"}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: "center", gap: 12 },
  title: { color: colors.text, fontSize: 40, fontWeight: "700" },
  sub: { color: colors.muted, marginBottom: 12, fontSize: 16 },
  input: {
    backgroundColor: colors.bgElevated,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: { color: colors.danger },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonLabel: { color: colors.bg, fontWeight: "700", fontSize: 16 },
});
