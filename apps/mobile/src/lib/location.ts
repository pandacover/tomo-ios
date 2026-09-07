import type { LocationFix } from "@tomo/shared";
import * as Location from "expo-location";

export async function readLocation(): Promise<LocationFix | { error: string }> {
  const existing = await Location.getForegroundPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const requested = await Location.requestForegroundPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") {
    return { error: "location permission denied" };
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}
