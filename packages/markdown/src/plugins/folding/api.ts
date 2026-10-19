export interface Folding {
  foldAll(): boolean;
  unfoldAll(): boolean;
  toggle(): boolean;
}
declare module "@workshop/core" {
  interface Services {
    fold: Folding;
  }
}
