import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/src/theme";

type ToolPart = {
  type: string;
  state?: string;
  toolName?: string;
  output?: unknown;
};

export function ToolChip({ part }: { part: ToolPart }) {
  const name = part.toolName ?? part.type.replace(/^tool-/, "");
  const done = part.state === "output-available" || part.state === "output-error";
  const label = formatLabel(name, part.output, done);
  return (
    <View style={styles.chip}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

export function ApprovalRow({
  label,
  onApprove,
  onReject,
}: {
  label: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <View style={styles.approval}>
      <Text style={styles.text}>{label}</Text>
      <View style={styles.row}>
        <Pressable onPress={onReject} style={styles.reject}>
          <Text style={styles.btnText}>Reject</Text>
        </Pressable>
        <Pressable onPress={onApprove} style={styles.approve}>
          <Text style={styles.btnText}>Approve</Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatLabel(name: string, output: unknown, done: boolean): string {
  if (name === "setReminder" && output && typeof output === "object" && "dueAt" in output) {
    const dueAt = String((output as { dueAt?: string }).dueAt ?? "");
    return done ? `Reminder set for ${dueAt}` : "Setting reminder…";
  }
  if (name === "web_search") return done ? "Searched the web" : "Searching the web…";
  if (name === "searchMemories") return done ? "Searched memory" : "Searching memory…";
  if (name === "addMemory") return done ? "Saved to memory" : "Saving memory…";
  if (name === "getDeviceContext") return done ? "Read device time" : "Reading device…";
  if (name === "getLocation") return done ? "Read location" : "Reading location…";
  return done ? name : `${name}…`;
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  text: { color: colors.muted, fontSize: 13 },
  approval: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.bgElevated,
    gap: 8,
  },
  row: { flexDirection: "row", gap: 8 },
  approve: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  reject: {
    backgroundColor: colors.danger,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnText: { color: colors.bg, fontWeight: "600" },
});
