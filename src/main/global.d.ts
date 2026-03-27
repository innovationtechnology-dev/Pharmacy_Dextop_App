/**
 * Global type declarations for Electron main process
 */

import type nodeFetch from 'node-fetch';

declare global {
  var fetch: typeof nodeFetch;
  var Headers: typeof nodeFetch.Headers;
  var Request: typeof nodeFetch.Request;
  var Response: typeof nodeFetch.Response;
}

export {};
