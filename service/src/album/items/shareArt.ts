import { catalogue } from "../hoggies/catalogue.ts";

export const sharedHoggies = catalogue.hoggies.map(({ hoggie }) => hoggie);

export function hoggieSharePictureOf(hoggie: string): string {
  return `/share/${hoggie}.png`;
}
