/**
 * Test Analyzer Extension
 *
 * Hooks into bash tool results to detect and summarize test failures.
 * Supports common test runners: Jest, Pytest, Go test, Vitest, Bun test.
 */

import type { ExtensionAPI, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import type { TextContent } from "@mariozechner/pi-ai";

const TEST_RUNNER_PATTERNS = [
    /\bnpm\s+test\b/,
    /\bpytest\b/,
    /\bgo\s+test\b/,
    /\bvitest\b/,
    /\bbun\s+test\b/,
    /\bcargo\s+test\b/,
];

const FAILURE_MARKERS = [
    /FAIL\s+(.+)/,
    /FAILED\s+\[/,
    /AssertionError:/,
    /Error: expect\(received\).toBe\(expected\)/,
    /--- FAIL:/,
    /FAILED\s+\d+/,
];

function isTestCommand(command: string): boolean {
    return TEST_RUNNER_PATTERNS.some(p => p.test(command));
}

function extractTextContent(event: ToolResultEvent): string {
    return event.content
        .filter((part): part is TextContent => part.type === "text")
        .map((part) => part.text)
        .join("\n");
}

function parseFailures(text: string): string[] {
    const lines = text.split("\n");
    const found: string[] = [];
    
    for (const line of lines) {
        if (FAILURE_MARKERS.some(m => m.test(line))) {
            found.push(line.trim());
        }
    }
    
    return [...new Set(found)].slice(0, 10); // Limit to top 10 unique failures
}

export default function (pi: ExtensionAPI) {
    pi.on("tool_result", async (event, ctx) => {
        if (event.toolName !== "bash" || event.isError) return;

        const input = event.input as { command?: string };
        if (!input?.command || !isTestCommand(input.command)) return;

        const text = extractTextContent(event);
        const failures = parseFailures(text);

        if (failures.length === 0 && text.toLowerCase().includes("fail")) {
            // Fallback for generic failures
            failures.push("Detected potential test failure in output (see above)");
        }

        if (failures.length > 0) {
            const summary = [
                "",
                "🧪 **Test Failure Analysis**",
                "Detected the following failing tests:",
                ...failures.map(f => `- ${f}`),
                "",
                "**Suggestion:** Use the `debug` skill or check the failing files listed above.",
            ].join("\n");

            // Add summary to tool output
            const nextContent = [...event.content];
            nextContent.push({ type: "text", text: summary });

            // Ask user if they want to start fixing
            if (ctx.hasUI) {
                // We use a small delay to ensure the tool result is rendered first
                setTimeout(async () => {
                    const shouldFix = await ctx.ui.confirm(
                        "🛠️ Test Failure Detected",
                        "Would you like me to analyze the failures and suggest a fix?"
                    );

                    if (shouldFix) {
                        pi.sendUserMessage(
                            `The tests failed with the following errors:\n${failures.join("\n")}\n\nPlease analyze the code and the test output above, explain WHY it failed, and propose a fix. Do not modify the tests themselves unless they are actually incorrect.`
                        );
                    }
                }, 100);
            }

            return {
                content: nextContent,
            };
        }
    });
}
