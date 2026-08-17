import { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios";

/**
 * Adapter implementations that stand in for the network.
 *
 * Replacing the adapter leaves the rest of axios — base URL, headers, JSON
 * handling, interceptors — running exactly as it does in the browser, so the
 * configuration in `ApiClient` stays under test instead of being stubbed out
 * along with the network.
 */

/**
 * Answers with `data` and `status`.
 *
 * `validateStatus` is enforced *inside* the built-in adapters rather than by
 * axios itself, so a stub that simply resolved on a 404 would never reach the
 * error path. This rejects on a non-2xx exactly as the xhr adapter does.
 */
export function respondWith(data: unknown, status = 200): AxiosAdapter {
  return async (config) => {
    const response = { data, status, statusText: "", headers: {}, config } as AxiosResponse;
    if (status >= 200 && status < 300) return response;

    throw new AxiosError(
      `Request failed with status code ${status}`,
      status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      undefined,
      response,
    );
  };
}

/** A request that never reached the server: offline, refused, CORS. */
export function networkError(): AxiosAdapter {
  return (config) =>
    Promise.reject(new AxiosError("Network Error", AxiosError.ERR_NETWORK, config));
}
