export interface PasteData {
  text: string;
  html: string;
}
declare module "../../kernel/types" {
  interface Events {
    /** @mode pipeline */ "paste/transform": (
      data: PasteData,
    ) => PasteData | Promise<PasteData>;
  }
}
