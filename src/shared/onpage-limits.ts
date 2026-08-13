// How many title/meta suggestions one "AI rewrite" click may send. Shared so
// the button's selection, the server function's input schema and the service's
// own slice all read the same number and can't drift apart: the button used to
// send every pending row, which the schema rejected outright — so on a project
// with more than this many pending rows the metered action failed every time.
export const MAX_AI_REWRITE_PER_CLICK = 25;
