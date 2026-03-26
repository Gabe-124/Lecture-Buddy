/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as courses from "../courses.js";
import type * as http from "../http.js";
import type * as images from "../images.js";
import type * as notes from "../notes.js";
import type * as router from "../router.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as transcript from "../transcript.js";
import type * as uncertainty from "../uncertainty.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  courses: typeof courses;
  http: typeof http;
  images: typeof images;
  notes: typeof notes;
  router: typeof router;
  seed: typeof seed;
  sessions: typeof sessions;
  transcript: typeof transcript;
  uncertainty: typeof uncertainty;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
