import { Redirect } from "expo-router";
import { useAuth } from "@/src/lib/auth-context";

export default function Index() {
  const { credentials } = useAuth();
  return <Redirect href={credentials ? "/(app)" : "/setup"} />;
}
