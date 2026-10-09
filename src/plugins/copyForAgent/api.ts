import type { SourceSelection } from "../editor/api";
import type { Cancellation } from "../../shared/rpc/lifecycle";
export interface AgentReference {
  readonly text: string;
  readonly uri: string;
  readonly startLine: number;
  readonly endLine: number;
}
export interface Agent {
  reference(selection: SourceSelection): AgentReference;
  copy(
    editorId: string,
    options?: { interactive?: boolean; token?: Cancellation; ask?: boolean },
  ): Promise<boolean>;
}
declare module "../../kernel/types" {
  interface Services {
    agent: Agent;
  }
}
