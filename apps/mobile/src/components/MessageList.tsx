import { getToolApproval } from "@cloudflare/ai-chat/react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ApprovalRow, ToolChip } from "@/src/components/ToolChip";
import { colors } from "@/src/theme";

type ChatMessage = {
  id: string;
  role: string;
  parts: Array<Record<string, unknown>>;
};

export function MessageList({
  messages,
  onApprove,
  onReject,
}: {
  messages: ChatMessage[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      {messages.length === 0 ? (
        <Text style={styles.empty}>Say anything. I remember.</Text>
      ) : (
        messages.map((message) => (
          <View
            key={message.id}
            style={[styles.bubble, message.role === "user" ? styles.user : styles.assistant]}
          >
            {message.parts.map((part) => {
              const type = String(part.type ?? "");
              const key = partKey(message.id, part);
              if (type === "text") {
                return (
                  <Text key={key} style={styles.body}>
                    {String(part.text ?? "")}
                  </Text>
                );
              }
              if (part.state === "approval-requested") {
                const approval = getToolApproval(part as never);
                if (!approval) return null;
                return (
                  <ApprovalRow
                    key={key}
                    label={`Approve ${String(part.toolName ?? "this action")}?`}
                    onApprove={() => onApprove(approval.id)}
                    onReject={() => onReject(approval.id)}
                  />
                );
              }
              if (type.startsWith("tool-") || type === "dynamic-tool") {
                return <ToolChip key={key} part={part as { type: string }} />;
              }
              return null;
            })}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function partKey(messageId: string, part: Record<string, unknown>): string {
  const type = String(part.type ?? "part");
  const id = part.toolCallId ?? part.id;
  if (typeof id === "string" && id.length > 0) return `${messageId}:${id}`;
  if (type === "text") return `${messageId}:text:${String(part.text ?? "")}`;
  return `${messageId}:${type}:${String(part.toolName ?? "")}:${String(part.state ?? "")}`;
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10, paddingBottom: 24 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 48, fontSize: 16 },
  bubble: {
    maxWidth: "92%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  user: { alignSelf: "flex-end", backgroundColor: colors.userBubble },
  assistant: { alignSelf: "flex-start", backgroundColor: colors.assistantBubble },
  body: { color: colors.text, fontSize: 16, lineHeight: 22 },
});
