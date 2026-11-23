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

The server calls TMDB's multi-search, trending movies, movie and TV details/credits, person details, and person combined-credits endpoints. Actor filmographies include cast credits for both movies and TV series, deduplicated and ranked by popularity. TMDB is an upstream catalog, not a complete actor/media graph. Cast lists can be incomplete or capped; person filmography credits can be duplicated or incomplete. Popularity is used only to order/limit browse results, not as evidence that credits are exhaustive.

To keep random puzzle creation bounded, the generator samples up to four weekly trending movies, up to 20 cast entries per movie or TV series, and up to 20 popularity-sorted acting credits for three sampled actors. When needed, it expands up to four additional layers, sampling at most two media casts and two actor filmographies per layer. This supports sampled paths up to nine transitions while bounding additional TMDB requests; shorter requested tiers can stop expanding as soon as a matching puzzle is available. Random generation targets Bronze, Silver, and Gold about 55%, 35%, and 10% of the time, falling back to an available tier if the sampled graph cannot satisfy the requested one. Bronze covers 2–3 transitions, Silver 4–6, and Gold 7–9. BFS finds the shortest route in the fetched graph. It cannot certify a globally shortest route across every TMDB credit; the interface labels it as the shortest known route and warns that credit data may be incomplete. Search and connection browsing are constrained to credits returned by the API.

The optional destination hint uses the destination actor's most-popular returned movie or TV credit, or the first actor in a destination movie or series' returned cast order. TMDB cast order is a top-billing signal, not a guarantee of the lead actor. Hints do not add a move.

Movie, TV series, and actor details are hidden during play. After completing a puzzle, choose “View destination details” on the completion screen to open a modal with the destination's overview, or actor biography and popular mixed movie/TV acting credits. Collection-card, hint, and completion modals lock background scrolling; longer modal content scrolls within the modal.

Successful TMDB responses are cached in memory for one hour, duplicate in-flight requests are coalesced, outbound concurrency is limited to three requests, and requests time out after 10 seconds. HTTP 429 responses are returned with their `Retry-After` header when TMDB provides one. The cache is process-local and is not shared across instances.

Personal statistics and destination cards are stored in the current browser's `localStorage`; intermediate path guesses are not collected. A card keeps the puzzle's difficulty color when completed within its reward limit: Bronze requires the shortest known path, Silver allows four extra steps, and Gold allows six. Completing beyond that limit earns a grayscale card, which can later upgrade to a colored tier; a card never downgrades. The Steps panel shows the exact limit and tier for the active puzzle. Repeated destination completions increment the card's count. Existing cards without a recorded tier are treated as Bronze. Selecting a collection card loads its TMDB overview, or biography and popular mixed movie/TV acting credits. No account or server-side player record is created. This product uses the TMDB API but is not endorsed or certified by TMDB.
