/**
 * The tools at the bottom of the canvas: pen, pencil, marker and eraser,
 * then the chosen ink's three widths and its colour. Each ink keeps its own
 * colour and width, as in Notes.
 */
import {
  COLOR_NAMES,
  COLORS,
  DRAWING_TOOLS,
  WIDTH_NAMES,
  type CanvasTool,
  type DrawingTool,
  type ToolChoice,
  type WidthStep,
} from "./nibs";
import {
  groupStyle,
  segmentStyle,
  styled,
  swatchStyle,
  widthDotStyle,
  widthStyle,
  type Style,
} from "./styles";

const TOOL_NAMES: Readonly<Record<CanvasTool, string>> = {
  pen: "Pen",
  pencil: "Pencil",
  marker: "Marker",
  eraser: "Eraser",
};

/** The dots that show the three widths, in CSS pixels. */
const WIDTH_DOTS = [4, 8, 13] as const;

export class Palette {
  constructor(
    private readonly container: HTMLElement,
    private choice: ToolChoice,
    private readonly changed: (choice: ToolChoice) => void,
  ) {
    this.render();
  }

  get current(): ToolChoice {
    return this.choice;
  }

  private choose(choice: ToolChoice): void {
    this.choice = choice;
    this.render();
    this.changed(choice);
  }

  /** A dozen buttons: rebuilt whole on each choice. */
  private render(): void {
    const { tool } = this.choice;
    const groups = [this.tools()];
    if (tool !== "eraser") {
      groups.push(this.widths(tool), this.colors(tool));
    }
    this.container.replaceChildren(...groups);
  }

  private tools(): HTMLElement {
    const tools: readonly CanvasTool[] = [...DRAWING_TOOLS, "eraser"];
    return group(
      "Tool",
      tools.map((tool) =>
        choiceButton({
          label: TOOL_NAMES[tool],
          text: TOOL_NAMES[tool],
          isChosen: tool === this.choice.tool,
          style: segmentStyle(tool === this.choice.tool),
          choose: () => this.choose({ ...this.choice, tool }),
        }),
      ),
    );
  }

  private widths(tool: DrawingTool): HTMLElement {
    const steps: readonly WidthStep[] = [0, 1, 2];
    return group(
      "Width",
      steps.map((step) => {
        const isChosen = this.choice.widths[tool] === step;
        const item = choiceButton({
          label: WIDTH_NAMES[step],
          isChosen,
          style: widthStyle(isChosen),
          choose: () =>
            this.choose({
              ...this.choice,
              widths: { ...this.choice.widths, [tool]: step },
            }),
        });
        const dot = document.createElement("span");
        item.append(
          styled(
            dot,
            widthDotStyle(WIDTH_DOTS[step], this.choice.colors[tool]),
          ),
        );
        return item;
      }),
    );
  }

  private colors(tool: DrawingTool): HTMLElement {
    return group(
      "Colour",
      COLORS.map((color) => {
        const isChosen = this.choice.colors[tool] === color;
        return choiceButton({
          label: COLOR_NAMES[color],
          isChosen,
          style: swatchStyle(color, isChosen),
          choose: () =>
            this.choose({
              ...this.choice,
              colors: { ...this.choice.colors, [tool]: color },
            }),
        });
      }),
    );
  }
}

interface ChoiceButton {
  readonly label: string;
  readonly text?: string;
  readonly isChosen: boolean;
  readonly style: Style;
  readonly choose: () => void;
}

function choiceButton(options: ChoiceButton): HTMLButtonElement {
  const element = styled(document.createElement("button"), options.style);
  element.type = "button";
  element.title = options.label;
  element.setAttribute("aria-label", options.label);
  element.setAttribute("aria-pressed", String(options.isChosen));
  if (options.text) {
    element.textContent = options.text;
  }
  element.addEventListener("click", options.choose);
  return element;
}

function group(label: string, items: readonly HTMLElement[]): HTMLElement {
  const element = styled(document.createElement("div"), groupStyle);
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", label);
  element.append(...items);
  return element;
}
