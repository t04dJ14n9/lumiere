export interface PasteData {
  text: string;
  html: string;
}
declare module "@workshop/core" {
  interface Events {
    /** @mode pipeline */ "paste/transform": (
      data: PasteData,
    ) => PasteData | Promise<PasteData>;
  }
}
