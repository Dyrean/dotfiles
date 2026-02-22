/**
 * Dependency Doctor Extension
 *
 * Intercepts bash errors to detect missing dependencies and offers to install them.
 * Supports: npm, bun, pip, cargo.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";

const DEPENDENCY_ERRORS = [
    // Node.js
    { pattern: /Error: Cannot find module '(.+)'/, tool: "npm", command: (pkg: string) => `npm install ${pkg}` },
    { pattern: /Module not found: Error: Can't resolve '(.+)'/, tool: "npm", command: (pkg: string) => `npm install ${pkg}` },
    // Python
    { pattern: /ModuleNotFoundError: No module named '(.+)'/, tool: "pip", command: (pkg: string) => `pip install ${pkg}` },
    { pattern: /ImportError: (.+)/, tool: "pip", command: (pkg: string) => `pip install ${pkg}` },
    // Rust
    { pattern: /error\[E0432\]: unresolved import `(.+)`/, tool: "cargo", command: (pkg: string) => `cargo add ${pkg}` },
];

function extractTextContent(content: any[]): string {
    return content
        .filter((part): part is TextContent => part.type === "text")
        .map((part) => part.text)
        .join("\n");
}

export default function (pi: ExtensionAPI) {
    pi.on("tool_result", async (event, ctx) => {
        if (event.toolName !== "bash" || !event.isError) return;

        const text = extractTextContent(event.content);

        for (const error of DEPENDENCY_ERRORS) {
            const match = text.match(error.pattern);
            if (match && match[1]) {
                const pkg = match[1].split('/')[0]; // Handle scoped packages or submodules
                const installCmd = error.command(pkg!);

                if (ctx.hasUI) {
                    setTimeout(async () => {
                        const shouldInstall = await ctx.ui.confirm(
                            "📦 Missing Dependency",
                            `It looks like '${pkg}' is missing. Should I run '${installCmd}'?`
                        );

                        if (shouldInstall) {
                            pi.sendUserMessage(`!${installCmd}`);
                        }
                    }, 150);
                }
                break;
            }
        }
    });
}
