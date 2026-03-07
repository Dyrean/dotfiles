type WidgetValue = unknown;

type WidgetOptions = {
  placement?: "aboveEditor" | "belowEditor";
};

interface WidgetRegistryContext {
  hasUI: boolean;
  ui: {
    setWidget: (key: string, value: WidgetValue, options?: WidgetOptions) => void;
  };
}

interface WidgetEntry {
  value: WidgetValue;
  options?: WidgetOptions;
  order: number;
}

export const WIDGET_REGISTRY_KEY_PREFIX = "widget-registry:";

class WidgetRegistry {
  private ctx: WidgetRegistryContext | undefined;
  private entries = new Map<string, WidgetEntry>();
  private renderOrder: string[] = [];
  private nextOrder = 0;

  bind(ctx: WidgetRegistryContext): void {
    if (!ctx.hasUI) return;

    const previousCtx = this.ctx;
    this.ctx = ctx;

    if (previousCtx && previousCtx !== ctx) {
      this.clearRendered(previousCtx);
    }

    this.flush();
  }

  upsert(id: string, value: WidgetValue, options?: WidgetOptions): void {
    if (value === undefined) {
      this.remove(id);
      return;
    }

    const existing = this.entries.get(id);
    this.entries.set(id, {
      value,
      options,
      order: existing?.order ?? this.nextOrder++,
    });
    this.flush();
  }

  remove(id: string): void {
    const hadEntry = this.entries.delete(id);
    if (hadEntry) {
      this.flush();
      return;
    }

    if (this.renderOrder.includes(id)) {
      this.ctx?.ui.setWidget(this.getUiKey(id), undefined);
      this.renderOrder = this.renderOrder.filter((renderedId) => renderedId !== id);
    }
  }

  private flush(): void {
    const ctx = this.ctx;
    if (!ctx?.hasUI) return;

    this.clearRendered(ctx);

    const orderedEntries = [...this.entries.entries()].sort(([, left], [, right]) => left.order - right.order);
    this.renderOrder = orderedEntries.map(([id]) => id);

    for (const [id, entry] of orderedEntries) {
      ctx.ui.setWidget(this.getUiKey(id), entry.value, entry.options);
    }
  }

  private clearRendered(ctx: WidgetRegistryContext): void {
    for (const id of this.renderOrder) {
      ctx.ui.setWidget(this.getUiKey(id), undefined);
    }
    this.renderOrder = [];
  }

  private getUiKey(id: string): string {
    return `${WIDGET_REGISTRY_KEY_PREFIX}${id}`;
  }
}

const registry = new WidgetRegistry();

export function bindWidgetRegistry(ctx: { hasUI: boolean; ui: unknown }): void {
  registry.bind(ctx as WidgetRegistryContext);
}

export function setWidgetEntry(id: string, value: WidgetValue, options?: WidgetOptions): void {
  registry.upsert(id, value, options);
}

export function clearWidgetEntry(id: string): void {
  registry.remove(id);
}
