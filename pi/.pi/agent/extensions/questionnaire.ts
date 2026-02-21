
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
    type Component,
    Editor,
    type EditorTheme,
    Key,
    matchesKey,
    type TUI,
} from "@mariozechner/pi-tui";
import { ansiBold, ansiColor, ansiDim } from "../prelude/ui/ansi.js";
import { borderLine, contentLine, emptyLine } from "../prelude/ui/box.js";
import { padRightVisible } from "../prelude/ui/layout.js";

class Questionnaire implements Component {
    private questions: string[];
    private answers: string[];
    private currentIndex: number = 0;
    private editor: Editor;
    private tui: TUI;
    private onDone: (result: string | null) => void;
    private showingConfirmation: boolean = false;

    // ANSI styles
    private dim = (s: string) => ansiDim(s, { fullReset: true });
    private bold = (s: string) => ansiBold(s, { fullReset: true });
    private cyan = (s: string) => ansiColor(s, 36, { fullReset: true });
    private green = (s: string) => ansiColor(s, 32, { fullReset: true });
    private yellow = (s: string) => ansiColor(s, 33, { fullReset: true });
    private gray = (s: string) => ansiColor(s, 90, { fullReset: true });

    constructor(
        questions: string[],
        tui: TUI,
        onDone: (result: string | null) => void,
    ) {
        this.questions = questions;
        this.answers = questions.map(() => "");
        this.tui = tui;
        this.onDone = onDone;

        const editorTheme: EditorTheme = {
            borderColor: this.dim,
            selectList: {
                selectedPrefix: this.cyan,
                selectedText: (s: string) => `\x1b[44m${s}\x1b[0m`,
                description: this.gray,
                scrollInfo: this.dim,
                noMatch: this.dim,
            },
        };

        this.editor = new Editor(tui, editorTheme);
        this.editor.disableSubmit = true;
        this.editor.onChange = () => {
            this.tui.requestRender();
        };
    }

    private saveCurrentAnswer(): void {
        this.answers[this.currentIndex] = this.editor.getText();
    }

    private navigateTo(index: number): void {
        if (index < 0 || index >= this.questions.length) return;
        this.saveCurrentAnswer();
        this.currentIndex = index;
        this.editor.setText(this.answers[index] || "");
    }

    private submit(): void {
        this.saveCurrentAnswer();

        const parts: string[] = [];
        for (let i = 0; i < this.questions.length; i++) {
            const q = this.questions[i];
            if (!q) continue;
            const a = this.answers[i]?.trim() || "(no answer)";
            parts.push(`Q: ${q}`);
            parts.push(`A: ${a}`);
            parts.push("");
        }

        this.onDone(parts.join("\n").trim());
    }

    private cancel(): void {
        this.onDone(null);
    }

    invalidate(): void {}

    handleInput(data: string): void {
        if (this.showingConfirmation) {
            if (matchesKey(data, Key.enter) || data.toLowerCase() === "y") {
                this.submit();
                return;
            }
            if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || data.toLowerCase() === "n") {
                this.showingConfirmation = false;
                this.tui.requestRender();
                return;
            }
            return;
        }

        if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
            this.cancel();
            return;
        }

        if (matchesKey(data, Key.tab)) {
            if (this.currentIndex < this.questions.length - 1) {
                this.navigateTo(this.currentIndex + 1);
                this.tui.requestRender();
            }
            return;
        }
        if (matchesKey(data, Key.shift("tab"))) {
            if (this.currentIndex > 0) {
                this.navigateTo(this.currentIndex - 1);
                this.tui.requestRender();
            }
            return;
        }

        if (matchesKey(data, Key.enter) && !matchesKey(data, Key.shift("enter"))) {
            this.saveCurrentAnswer();
            if (this.currentIndex < this.questions.length - 1) {
                this.navigateTo(this.currentIndex + 1);
            } else {
                this.showingConfirmation = true;
            }
            this.tui.requestRender();
            return;
        }

        this.editor.handleInput(data);
        this.tui.requestRender();
    }

    render(width: number): string[] {
        const lines: string[] = [];
        const boxWidth = Math.min(width - 4, 120);
        const contentWidth = boxWidth - 4;

        const boxLine = (content: string, leftPad: number = 2): string =>
            contentLine(content, boxWidth, this.dim, leftPad);

        const emptyBoxLine = (): string => emptyLine(boxWidth, this.dim);

        const padToWidth = (line: string): string => padRightVisible(line, width);

        lines.push(padToWidth(borderLine(boxWidth, "╭", "╮", this.dim)));
        const title = `${this.bold(this.cyan("Questionnaire"))} ${this.dim(`(${this.currentIndex + 1}/${this.questions.length})`)}`;
        lines.push(padToWidth(boxLine(title)));
        lines.push(padToWidth(borderLine(boxWidth, "├", "┤", this.dim)));

        const q = this.questions[this.currentIndex];
        if (!q) {
            lines.push(padToWidth(boxLine(this.dim("No question selected"))));
            lines.push(padToWidth(borderLine(boxWidth, "╰", "╯", this.dim)));
            return lines;
        }
        const questionText = `${this.bold("Q:")} ${q}`;
        lines.push(padToWidth(boxLine(questionText)));

        lines.push(padToWidth(emptyBoxLine()));

        const answerPrefix = this.bold("A: ");
        const editorWidth = contentWidth - 4 - 3;
        const editorLines = this.editor.render(editorWidth);
        for (let i = 1; i < editorLines.length - 1; i++) {
            if (i === 1) {
                lines.push(padToWidth(boxLine(answerPrefix + editorLines[i])));
            } else {
                lines.push(padToWidth(boxLine("   " + editorLines[i])));
            }
        }

        lines.push(padToWidth(emptyBoxLine()));

        if (this.showingConfirmation) {
            lines.push(padToWidth(borderLine(boxWidth, "├", "┤", this.dim)));
            const confirmMsg = `${this.yellow("Submit all answers?")} ${this.dim("(Enter/y to confirm, Esc/n to cancel)")}`;
            lines.push(padToWidth(boxLine(confirmMsg)));
        } else {
            lines.push(padToWidth(borderLine(boxWidth, "├", "┤", this.dim)));
            const controls = `${this.dim("Tab/Enter")} next · ${this.dim("Shift+Tab")} prev · ${this.dim("Shift+Enter")} newline · ${this.dim("Esc")} cancel`;
            lines.push(padToWidth(boxLine(controls)));
        }
        lines.push(padToWidth(borderLine(boxWidth, "╰", "╯", this.dim)));

        return lines;
    }
}

export default function (pi: ExtensionAPI) {
    pi.registerCommand("questionnaire", {
        description: "Asks a series of questions",
        async handler(_args: any, ctx: ExtensionContext) {
            if (!ctx.hasUI) {
                ctx.ui.notify("questionnaire requires interactive mode", "error");
                return;
            }
            
            const questions = ["What is your name?", "What is your quest?", "What is your favorite color?"];

            const answersResult = await ctx.ui.custom<string | null>((tui, _theme, _kb, done) => {
                return new Questionnaire(questions, tui, done);
            });

            if (answersResult === null) {
                ctx.ui.notify("Questionnaire cancelled", "info");
                return;
            }
            
            ctx.ui.notify("Questionnaire submitted!");
            pi.sendUserMessage(answersResult);
        },
    });
}
