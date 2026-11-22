# ReelLink

ReelLink is a responsive movie-and-actor connection game. Each valid actor/movie credit is one step; the game uses breadth-first search (BFS) to compare a completed route with the shortest route in its current credit graph.

## Run locally

1. Install Node.js 22 or later.
2. Copy `.env.example` to `.env` and set `TMDB_API_KEY` to your TMDB API key. The key is used only by the server.
3. Run `npm install`, then `npm run dev`.
4. Open the Vite URL printed in the terminal (normally `http://localhost:5173`).

`npm test` runs the graph, game-rule, and local-statistics tests. `npm run build` type-checks both app and server and creates the production frontend and server builds. Run the server build with `npm start`.

## Structure

- `src/game`: entity graph, BFS shortest path, legal transition rules, and local statistics.
- `src/api`: frontend-facing DTOs and API client.
- `server/data`: TMDB HTTP client, response normalization, and in-memory TTL cache.
- `server/services`: puzzle generation, kept separate from API route handling.
- `server/index.ts`: modular-monolith HTTP API.

Puzzle metadata already includes source, creator, validation, and publication fields so daily, curated, or community puzzle types can be added without coupling them to account features.

## TMDB coverage and shortest paths

The server calls TMDB's multi-search, trending movies, movie details/credits, person details, and person movie-credits endpoints. TMDB is an upstream catalog, not a complete actor/movie graph. Movie cast lists can be incomplete or capped; person filmography credits can be duplicated, popularity-ranked, or incomplete. Popularity is used only to order/limit browse results, not as evidence that credits are exhaustive.

To keep random puzzle creation bounded, the generator samples up to four weekly trending movies, up to 20 cast entries per movie, and up to 20 popularity-sorted movie credits for three sampled actors. BFS finds the shortest route in that fetched graph. It cannot certify a globally shortest route across every TMDB credit; the interface labels it as the shortest known route and warns that credit data may be incomplete. Search and connection browsing are constrained to credits returned by the API.

The optional destination hint uses the destination actor's most-popular returned film, or the first actor in a destination movie's returned cast order. TMDB cast order is a top-billing signal, not a guarantee of the movie's lead actor. Hints do not add a move.

The currently selected path entity is expanded below the game with its movie overview and TMDB rating, or the actor biography and popular movie credits. At puzzle completion, choose “View details below” to dismiss the score summary and inspect the destination details.

Successful TMDB responses are cached in memory for one hour, duplicate in-flight requests are coalesced, outbound concurrency is limited to three requests, and requests time out after 10 seconds. HTTP 429 responses are returned with their `Retry-After` header when TMDB provides one. The cache is process-local and is not shared across instances.

Personal statistics are stored in the current browser's `localStorage`; no account or server-side player record is created. This product uses the TMDB API but is not endorsed or certified by TMDB.
