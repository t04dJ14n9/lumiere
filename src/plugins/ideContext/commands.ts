import {
  copyIdeContext,
  sendIdeContext,
  type SendIdeContextDeps,
} from "./delivery";
import { buildMwIdeContextPacket, type MwIdeContextInput } from "./adapter";
import type { IdeContextPacket } from "../../shared/ide-context";

export async function runCopyIdeContext(
  input: MwIdeContextInput,
  clipboardWrite: (text: string) => Promise<void>,
  inform?: (message: string) => void,
): Promise<IdeContextPacket> {
  const packet = buildMwIdeContextPacket(input);
  await copyIdeContext(packet, clipboardWrite, inform);
  return packet;
}

export async function runSendIdeContext(
  input: MwIdeContextInput,
  deps: SendIdeContextDeps,
): Promise<{
  packet: IdeContextPacket;
  result: Awaited<ReturnType<typeof sendIdeContext>>;
}> {
  const packet = buildMwIdeContextPacket(input);
  const result = await sendIdeContext(packet, deps);
  return { packet, result };
}
