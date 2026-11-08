// The division's postseason, folded once per build from every configured
// conference this build loaded. Kept apart from postseason.ts so the folding
// rules stay importable without the data home (journal.ts reads them, and
// home.ts reads journal.ts).

import { homeSeasons } from "./home.ts";
import { type Postseason, postseasonOf } from "./postseason.ts";

let division: Postseason | null = null;

/** The postseason across every configured conference this build loaded,
 *  folded once per build. */
export function divisionPostseason(): Postseason {
  division ??= postseasonOf(homeSeasons());
  return division;
}
