import { containingFolder } from "../../shared/workspace-path";
import type { WikiPlace, WikiProject } from "./api";
import { notePlace } from "./place";

export function placeFor(
  projects: readonly WikiProject[],
  uri: string,
): WikiPlace | undefined {
  const found = containingFolder(
    uri,
    projects.map((project) => project.rootUri),
  );
  if (!found) {
    return undefined;
  }
  const project = projects.find((item) => item.rootUri === found.root);
  if (!project) {
    return undefined;
  }
  const place = notePlace(project.layout, found.relative);
  return {
    project,
    relativePath: found.relative,
    insideBundle: place.insideBundle,
    reserved: place.reserved,
    ...(place.collection ? { collection: place.collection } : {}),
  };
}
