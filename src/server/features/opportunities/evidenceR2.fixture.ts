type R2FixtureState = {
  objects: Map<string, string>;
  uploads: Map<string, Date>;
  failR2: boolean;
  failDelete: boolean;
  deleting: null | (() => Promise<void>);
  pageSize: number;
};

export function evidenceR2Binding(state: R2FixtureState) {
  return {
    head: async (key: string) =>
      state.objects.has(key)
        ? {
            key,
            size: state.objects.get(key)!.length,
            uploaded: state.uploads.get(key)!,
          }
        : null,
    list: async ({
      prefix,
      cursor,
      limit,
    }: {
      prefix: string;
      cursor?: string;
      limit: number;
    }) => {
      const keys = [...state.objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .toSorted();
      const start = Number(cursor ?? 0);
      const selected = keys.slice(
        start,
        start + Math.min(limit, state.pageSize),
      );
      return {
        objects: selected.map((key) => ({
          key,
          size: state.objects.get(key)!.length,
          uploaded: state.uploads.get(key)!,
        })),
        truncated: start + selected.length < keys.length,
        cursor: String(start + selected.length),
      };
    },
    delete: async (key: string) => {
      if (state.deleting) await state.deleting();
      if (state.failDelete) throw new Error("R2 delete unavailable");
      state.objects.delete(key);
      state.uploads.delete(key);
    },
    put: async (key: string, value: string) => {
      if (state.failR2) throw new Error("R2 unavailable");
      if (!state.objects.has(key)) state.objects.set(key, value);
      state.uploads.set(key, new Date());
      return {};
    },
  };
}
