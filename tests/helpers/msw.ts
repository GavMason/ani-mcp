/** MSW server setup with vitest lifecycle hooks */

import { beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { defaultHandlers } from "./handlers.js";
import { anilistClient } from "../../src/api/client.js";

export const mswServer = setupServer(...defaultHandlers);

beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  mswServer.resetHandlers();
  anilistClient.clearCache();
});
afterAll(() => mswServer.close());
