# Contributing to ani-mcp

## Project structure

```text
src/
  api/          API clients (AniList GraphQL, Jikan REST)
  engine/       Intelligence layer (taste, matcher, mood, compare, franchise, analytics)
  tools/        MCP tool definitions grouped by domain
  schemas.ts    Zod input schemas for all tools
  types.ts      TypeScript interfaces for API responses
  utils.ts      Shared formatting and helper functions
  index.ts      Server entry point and tool registration

tests/
  helpers/      MSW handlers, test server setup, fixtures
  api/          API client tests
  engine/       Engine unit tests
  tools/        Tool integration tests
```

## Setup

```bash
npm install
cp .env.example .env   # optional: add ANILIST_USERNAME and ANILIST_TOKEN
```

## Development workflow

```bash
npm run dev            # watch mode with tsx
npm run build          # compile TypeScript
npm test               # run all tests
npm run test:watch     # watch mode
npm run type-check     # tsc --noEmit
npm run lint           # eslint
npm run inspect        # MCP Inspector UI
```

## Adding a new tool

1. **Schema** - Add a Zod schema to `src/schemas.ts`
2. **Types** - Add response types to `src/types.ts` if the tool uses new API fields
3. **Query** - Add GraphQL queries to `src/api/queries.ts` if needed
4. **Tool** - Implement in the appropriate `src/tools/*.ts` file using `server.addTool()`
5. **Register** - If creating a new tool file, import and call `register*Tools(server)` in `src/index.ts`
6. **Test server** - Register in `tests/helpers/server.ts` if a new file was added
7. **MSW handler** - Add a default handler to `tests/helpers/handlers.ts` for the new query
8. **Tests** - Write integration tests in `tests/tools/*.ts`
9. **README** - Add the tool to the appropriate table in `README.md`

## Code style

- Concise inline comments above code blocks, not beside them
- JSDoc on exports: one-liner describing behavior, not implementation
- No `@param`/`@returns`/`@example` tags
- `// === Section Name ===` for visual grouping within files
- No non-null assertions (`!`) - use guard clauses with `throw` or extract to const

## Testing

Tests use [Vitest](https://vitest.dev) with [MSW](https://mswjs.io) for API mocking.

- Default handlers in `tests/helpers/handlers.ts` cover common queries
- Override handlers use `request.clone().json()` to avoid consuming the body
- Factory functions `makeMedia()` and `makeEntry()` in `tests/fixtures.ts`
- Integration tests create a real MCP client via `createTestClient()`

## Engine modules

The `src/engine/` directory contains pure logic with no MCP or API dependencies:

- **taste.ts** - Build taste profiles from a user's scored list
- **matcher.ts** - Score candidates against a taste profile
- **mood.ts** - Parse mood strings into genre/tag boost sets
- **compare.ts** - Compatibility scoring between two users
- **franchise.ts** - Franchise graph traversal for watch order
- **similar.ts** - Content similarity scoring between titles
- **analytics.ts** - Statistical analysis (calibration, drops, evolution)

These are good candidates for contribution since they're self-contained and well-tested.
