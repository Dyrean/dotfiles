type OverlayFactory<Result> = (tui: any, theme: any, keybindings: any, done: (result: Result) => void) => unknown;

type OverlayOptions = {
  anchor?: "center" | "top" | "bottom" | "left" | "right";
  width?: number | string;
  minWidth?: number;
  maxHeight?: number | string;
  margin?: number;
};

type OverlayUi = {
  custom: (...args: any[]) => Promise<unknown>;
};

type ManagedOverlayOptions = {
  id: string;
  replace?: boolean;
};

type ManagedViewOptions = ManagedOverlayOptions & {
  overlay?: boolean;
};

const DEFAULT_OVERLAY_OPTIONS: OverlayOptions = {
  anchor: "center",
  margin: 1,
};

const activeViewPromises = new Map<string, Promise<unknown>>();

export async function openOverlay<Result>(
  ui: OverlayUi,
  factory: OverlayFactory<Result>,
  overlayOptions?: OverlayOptions,
): Promise<Result> {
  return ui.custom(factory, {
    overlay: true,
    overlayOptions: {
      ...DEFAULT_OVERLAY_OPTIONS,
      ...overlayOptions,
    },
  }) as Promise<Result>;
}

export async function openManagedOverlay<Result>(
  ui: OverlayUi,
  options: ManagedOverlayOptions,
  factory: OverlayFactory<Result>,
  overlayOptions?: OverlayOptions,
): Promise<Result> {
  return openManagedView(ui, { ...options, overlay: true }, factory, overlayOptions);
}

export async function openManagedView<Result>(
  ui: OverlayUi,
  options: ManagedViewOptions,
  factory: OverlayFactory<Result>,
  overlayOptions?: OverlayOptions,
): Promise<Result> {
  if (!options.replace) {
    const existing = activeViewPromises.get(options.id);
    if (existing) {
      return existing as Promise<Result>;
    }
  }

  const promise = (options.overlay ?? false)
    ? openOverlay(ui, factory, overlayOptions)
    : (ui.custom(factory) as Promise<Result>);

  const managedPromise = promise.finally(() => {
    const current = activeViewPromises.get(options.id);
    if (current === managedPromise) {
      activeViewPromises.delete(options.id);
    }
  });

  activeViewPromises.set(options.id, managedPromise);
  return managedPromise;
}

export function isOverlayOpen(id: string): boolean {
  return activeViewPromises.has(id);
}
