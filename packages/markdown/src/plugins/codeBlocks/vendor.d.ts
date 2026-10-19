declare module "prism-languages" {
  import Prism from "prismjs";
  export const languageLoaders: ReadonlyMap<string, () => Promise<unknown>>;
  export const languageAliases: ReadonlyMap<string, string>;
  export default Prism;
}
declare module "prismjs/components/prism-core" {
  import Prism from "prismjs";
  export default Prism;
}
