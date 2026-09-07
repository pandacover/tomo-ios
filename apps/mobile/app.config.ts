import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "tomo",
  slug: "tomo",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "tomo",
  userInterfaceStyle: "dark",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "ai.tomo.app",
    infoPlist: {
      UIBackgroundModes: ["remote-notification"],
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-dev-client",
    [
      "expo-notifications",
      {
        sounds: [],
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission: "Tomo uses your location when you ask about nearby places.",
      },
    ],
  ],
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "",
    },
  },
};

export default config;
