export const mondayCatalogueVersion = "monday-1";

export function isPaidOnTheMondayPath({ catalogueVersion }: { catalogueVersion: string }): boolean {
  return catalogueVersion === mondayCatalogueVersion;
}
