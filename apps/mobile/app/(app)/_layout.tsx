import { Redirect, Stack } from "expo-router";
import { AssistantProvider } from "@/src/lib/assistant-context";
import { useAuth } from "@/src/lib/auth-context";
import { colors } from "@/src/theme";

export default function AppLayout() {
  const { credentials } = useAuth();
  if (!credentials) return <Redirect href="/setup" />;

  return (
    <AssistantProvider credentials={credentials}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </AssistantProvider>
  );
}
