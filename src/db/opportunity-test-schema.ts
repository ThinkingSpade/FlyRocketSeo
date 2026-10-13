// Real local SQLite fixtures deliberately bypass the Worker environment.
// Keep the dialect import at the database seam, not in feature repositories.
export * from "./d1/schema";
