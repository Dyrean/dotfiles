import { CustomEditor } from "@mariozechner/pi-coding-agent";

type EditorFactory = (tui: unknown, theme: unknown, keybindings: unknown) => unknown;

interface EditorPluginContext {
  hasUI: boolean;
  ui: {
    setEditorComponent: (...args: [EditorFactory | undefined]) => unknown;
  };
}

interface EditorPluginEntry {
  id: string;
  priority: number;
  order: number;
  wrap: (factory: EditorFactory, ctx: EditorPluginContext) => EditorFactory;
}

class EditorPluginStack {
  private ctx: EditorPluginContext | undefined;
  private plugins = new Map<string, EditorPluginEntry>();
  private nextOrder = 0;

  bind(ctx: EditorPluginContext): void {
    if (!ctx.hasUI) return;
    this.ctx = ctx;
    this.flush();
  }

  register(
    id: string,
    wrap: (factory: EditorFactory, ctx: EditorPluginContext) => EditorFactory,
    priority = 0,
  ): () => void {
    const existing = this.plugins.get(id);
    this.plugins.set(id, {
      id,
      priority,
      order: existing?.order ?? this.nextOrder++,
      wrap,
    });
    this.flush();
    return () => this.unregister(id);
  }

  unregister(id: string): void {
    if (!this.plugins.delete(id)) return;
    this.flush();
  }

  private flush(): void {
    const ctx = this.ctx;
    if (!ctx?.hasUI) return;

    const orderedPlugins = [...this.plugins.values()].sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.order - right.order;
    });

    let factory: EditorFactory = (tui, theme, keybindings) => new CustomEditor(tui as never, theme as never, keybindings as never);
    for (const plugin of orderedPlugins) {
      factory = plugin.wrap(factory, ctx);
    }

    ctx.ui.setEditorComponent(factory);
  }
}

const editorPluginStack = new EditorPluginStack();

export function bindEditorPluginStack(ctx: { hasUI: boolean; ui: unknown }): void {
  editorPluginStack.bind(ctx as EditorPluginContext);
}

export function registerEditorPlugin(
  id: string,
  wrap: (factory: EditorFactory, ctx: EditorPluginContext) => EditorFactory,
  priority = 0,
): () => void {
  return editorPluginStack.register(id, wrap, priority);
}

export function unregisterEditorPlugin(id: string): void {
  editorPluginStack.unregister(id);
}
