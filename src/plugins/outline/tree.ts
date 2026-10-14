import { metadata } from "../../markdown/metadata";
import { SourceCoordinates } from "../../shared/document/coordinates";
import type { TreeNode, TreeSource } from "../../shared/runtime";
import { OPEN_COMMAND } from "./commands";
import { headingAt, outlineOf } from "./headings";
import type { OutlineHeading } from "./headings";

/** The active note's headings, indexed for navigation and native tree reveals. */
export class OutlineSource implements TreeSource {
  private uri: string | undefined;
  private outline: OutlineHeading[] = [];
  private coordinates = new SourceCoordinates("");
  private readonly byId = new Map<string, OutlineHeading>();

  get isEmpty(): boolean {
    return this.outline.length === 0;
  }

  set(uri: string | undefined, text: string): void {
    this.uri = uri;
    this.coordinates = new SourceCoordinates(text);
    this.outline = uri ? outlineOf(metadata(text).headings) : [];
    this.byId.clear();
    this.index(this.outline);
  }

  private index(headings: readonly OutlineHeading[]): void {
    for (const heading of headings) {
      this.byId.set(heading.id, heading);
      this.index(heading.children);
    }
  }

  activeNode(editorOffset: number): TreeNode | undefined {
    const heading = headingAt(
      this.outline,
      this.coordinates.toSource(editorOffset),
    );
    return heading ? this.node(heading) : undefined;
  }

  roots(): TreeNode[] {
    return this.outline.map((heading) => this.node(heading));
  }

  /** Parents precede their children so Expand All can reveal them in order. */
  allNodes(): TreeNode[] {
    return [...this.byId.values()].map((heading) => this.node(heading));
  }

  children(node: TreeNode): TreeNode[] {
    const heading = this.byId.get(node.id);
    return heading ? heading.children.map((child) => this.node(child)) : [];
  }

  parent(node: TreeNode): TreeNode | undefined {
    const parent = this.byId.get(node.id)?.parent;
    return parent ? this.node(parent) : undefined;
  }

  private node(heading: OutlineHeading): TreeNode {
    return {
      id: heading.id,
      label: heading.title,
      ...(heading.children.length > 0 && { expanded: true }),
      command: { id: OPEN_COMMAND, args: [this.uri, heading.offset] },
    };
  }
}
