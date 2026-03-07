interface StatusRegistryContext {
  hasUI: boolean;
  ui: {
    setStatus: (key: string, value: string | undefined) => void;
  };
}

export type StatusDisplay = "inline" | "banner";

export interface StatusEntry {
  text: string;
  display?: StatusDisplay;
  priority?: number;
}

export interface StatusSnapshotEntry {
  id: string;
  text: string;
  display: StatusDisplay;
  priority: number;
}

interface RegisteredStatusEntry extends StatusEntry {
  display: StatusDisplay;
  priority: number;
  order: number;
}

export const STATUS_REGISTRY_KEY_PREFIX = "status-registry:";

class StatusRegistry {
  private ctx: StatusRegistryContext | undefined;
  private entries = new Map<string, RegisteredStatusEntry>();
  private renderOrder: string[] = [];
  private nextOrder = 0;

  bind(ctx: StatusRegistryContext): void {
    if (!ctx.hasUI) return;

    const previousCtx = this.ctx;
    this.ctx = ctx;

    if (previousCtx && previousCtx !== ctx) {
      this.clearRendered(previousCtx);
    }

    this.flush();
  }

  upsert(id: string, entry: StatusEntry | undefined): void {
    if (!entry) {
      this.remove(id);
      return;
    }

    const text = entry.text.trim();
    if (!text) {
      this.remove(id);
      return;
    }

    const existing = this.entries.get(id);
    this.entries.set(id, {
      text,
      display: entry.display ?? "inline",
      priority: entry.priority ?? 0,
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
      this.ctx?.ui.setStatus(this.getUiKey(id), undefined);
      this.renderOrder = this.renderOrder.filter((renderedId) => renderedId !== id);
    }
  }

  clear(): void {
    this.entries.clear();
    if (this.ctx) {
      this.clearRendered(this.ctx);
    }
  }

  snapshot(): StatusSnapshotEntry[] {
    return this.getOrderedEntries()
      .map(([id, entry]) => ({
        id,
        text: entry.text,
        display: entry.display,
        priority: entry.priority,
      }));
  }

  private flush(): void {
    const ctx = this.ctx;
    if (!ctx?.hasUI) return;

    this.clearRendered(ctx);

    const orderedEntries = this.getOrderedEntries();

    this.renderOrder = orderedEntries.map(([id]) => id);
    for (const [id, entry] of orderedEntries) {
      ctx.ui.setStatus(this.getUiKey(id), this.renderEntry(entry));
    }
  }

  private clearRendered(ctx: StatusRegistryContext): void {
    for (const id of this.renderOrder) {
      ctx.ui.setStatus(this.getUiKey(id), undefined);
    }
    this.renderOrder = [];
  }

  private getUiKey(id: string): string {
    return `${STATUS_REGISTRY_KEY_PREFIX}${id}`;
  }

  private getOrderedEntries(): [string, RegisteredStatusEntry][] {
    return [...this.entries.entries()].sort(([, left], [, right]) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return left.order - right.order;
    });
  }

  private renderEntry(entry: RegisteredStatusEntry): string {
    if (entry.display === "banner") {
      return `[${entry.text}]`;
    }
    return entry.text;
  }
}

const registry = new StatusRegistry();

export function bindStatusRegistry(ctx: StatusRegistryContext): void {
  registry.bind(ctx);
}

export function setStatusEntry(id: string, entry: StatusEntry | undefined): void {
  registry.upsert(id, entry);
}

export function clearStatusEntry(id: string): void {
  registry.remove(id);
}

export function clearAllStatusEntries(): void {
  registry.clear();
}

export function getStatusEntries(): StatusSnapshotEntry[] {
  return registry.snapshot();
}

export function isManagedStatusKey(key: string): boolean {
  return key.startsWith(STATUS_REGISTRY_KEY_PREFIX);
}
