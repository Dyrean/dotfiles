type FooterFactory = (...args: any[]) => unknown;

interface FooterManagerContext {
  hasUI: boolean;
  ui: {
    setFooter: (...args: [FooterFactory | undefined]) => unknown;
  };
}

interface FooterEntry {
  factory: FooterFactory;
  order: number;
}

class FooterManager {
  private ctx: FooterManagerContext | undefined;
  private entries = new Map<string, FooterEntry>();
  private nextOrder = 0;

  bind(ctx: FooterManagerContext): void {
    if (!ctx.hasUI) return;
    this.ctx = ctx;
    this.flush();
  }

  upsert(id: string, factory: FooterFactory | undefined): void {
    if (!factory) {
      this.remove(id);
      return;
    }

    const existing = this.entries.get(id);
    this.entries.set(id, {
      factory,
      order: existing?.order ?? this.nextOrder++,
    });
    this.flush();
  }

  remove(id: string): void {
    if (!this.entries.delete(id)) return;
    this.flush();
  }

  private flush(): void {
    const ctx = this.ctx;
    if (!ctx?.hasUI) return;

    const latestEntry = [...this.entries.values()].sort((left, right) => right.order - left.order)[0];
    ctx.ui.setFooter(latestEntry?.factory);
  }
}

const footerManager = new FooterManager();

export function bindFooterManager(ctx: { hasUI: boolean; ui: unknown }): void {
  footerManager.bind(ctx as FooterManagerContext);
}

export function setFooterRenderer(id: string, factory: FooterFactory | undefined): void {
  footerManager.upsert(id, factory);
}

export function clearFooterRenderer(id: string): void {
  footerManager.remove(id);
}
