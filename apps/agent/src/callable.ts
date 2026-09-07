import { callable } from "agents";

/**
 * Wrangler/esbuild does not emit TC39 method decorators. `@callable()` from
 * the Agents SDK is a TC39 decorator that only records the method in a
 * WeakMap, so we apply it by hand after the class is defined.
 */
export function markCallable<T extends object>(
  ctor: { prototype: T },
  names: readonly (keyof T & string)[],
): void {
  const proto = ctor.prototype as Record<string, unknown>;
  for (const name of names) {
    const method = proto[name];
    if (typeof method !== "function") {
      throw new Error(`markCallable: ${name} is not a method`);
    }
    callable()(
      method as (...args: never[]) => unknown,
      {
        kind: "method",
        name,
        static: false,
        private: false,
        addInitializer() {},
      } as unknown as ClassMethodDecoratorContext,
    );
  }
}
