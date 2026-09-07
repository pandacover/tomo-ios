declare namespace Cloudflare {
  interface Env {
    APP_TOKEN: string;
    OPENROUTER_API_KEY: string;
    SUPERMEMORY_API_KEY: string;
    EXPO_ACCESS_TOKEN?: string;
    CHAT_MODEL: string;
    UTILITY_MODEL: string;
    AssistantAgent: DurableObjectNamespace;
  }
}

interface Env extends Cloudflare.Env {}
