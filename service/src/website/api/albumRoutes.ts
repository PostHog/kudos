// The website API's routes for the album, the book, the collection, the inventory, hoggies, the leaderboards, the group
// and people boards and the activity. Stack S16 fills this list; the route table (table.ts) takes it as it is.
import { getAlbumPerson, getAlbumPersonArgs, getAlbumProfile, getAlbumWeek, getAlbumWeekArgs } from "../album.ts";
import { getBook } from "../book.ts";
import { memberRead, type Route } from "./route.ts";

// `as const satisfies` keeps each route's name and result type, which the return-type check reads.
export const albumRoutes = [
  memberRead("website.album.getAlbumPerson", getAlbumPersonArgs.shape, getAlbumPerson),
  memberRead("website.album.getAlbumWeek", getAlbumWeekArgs.shape, getAlbumWeek),
  memberRead("website.album.getAlbumProfile", {}, getAlbumProfile),
  memberRead("website.book.getBook", {}, getBook),
] as const satisfies readonly Route[];
