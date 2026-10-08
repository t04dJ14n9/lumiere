export interface Folding {
  foldAll(): boolean;
  unfoldAll(): boolean;
  toggle(): boolean;
}
declare module "../../kernel/types" {
  interface Services {
    fold: Folding;
  }
}
