declare module "@ungap/structured-clone" {
  export default function structuredClone<T>(value: T): T;
}

declare module "@stardazed/streams-text-encoding" {
  export const TextEncoderStream: typeof globalThis.TextEncoderStream;
  export const TextDecoderStream: typeof globalThis.TextDecoderStream;
}

declare module "react-native/Libraries/Utilities/PolyfillFunctions" {
  export function polyfillGlobal(name: string, getValue: () => unknown): void;
}
