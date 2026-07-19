/**
 * Walk known resource-array keys (`topics`, `queues`, `channels`, `streams`,
 * `actions`) and stamp a unique `id` on every item that lacks one.
 */
export function assignResourceIds<T extends Record<string, string | number | boolean | object | null | undefined>>(data: T): T {
  const resourceKeys = ["topics", "queues", "channels", "streams", "actions"];
  const result = { ...data };
  for (const key of resourceKeys) {
    const list = result[key];
    if (Array.isArray(list)) {
      (result as Record<string, string | number | boolean | object | null | undefined>)[key] = list.map(
        (item: string | number | boolean | object | null, i: number) => {
          if (typeof item === 'object' && item !== null) {
            return {
              ...item,
              id:
                ('id' in item && typeof (item as Record<string, string | number | boolean | object | null | undefined>).id === 'string' ? (item as Record<string, string | number | boolean | object | null | undefined>).id : "") ||
                `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            };
          }
          return item;
        }
      );
    }
  }
  return result;
}
