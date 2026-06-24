import { EnterpriseConnectionTestRunResource, GetEnterpriseConnectionTestRunsParams } from "../../types/enterpriseConnectionTestRun.js";

//#region src/react/hooks/useOrganizationEnterpriseConnectionTestRuns.d.ts
type UseOrganizationEnterpriseConnectionTestRunsParams = {
  enterpriseConnectionId: string | null;
  /**
   * Pass-through fetch parameters (pagination, status filter).
   * Defaults to `{ initialPage: 1, pageSize: 10 }`.
   */
  params?: GetEnterpriseConnectionTestRunsParams;
  /**
   * Polling interval (ms) applied between `revalidate()` and the moment the
   * first record arrives in the response.
   *
   * @default 2000
   */
  pollIntervalMs?: number;
  /**
   * If `false`, the hook is dormant — no fetch, no polling.
   *
   * @default true
   */
  enabled?: boolean;
  /**
   * When `true`, a background refetch keeps the previously-loaded page visible
   * (`isFetching` stays `true`, `isLoading` does not flip back to `true`) instead
   * of clearing to a cold-load state.
   *
   * @default false
   */
  keepPreviousData?: boolean;
};
type UseOrganizationEnterpriseConnectionTestRunsReturn = {
  data: EnterpriseConnectionTestRunResource[] | undefined;
  totalCount: number | undefined;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
  /**
   * `true` while the hook is actively polling for the first record to appear
   */
  isPolling: boolean;
  /**
   * Force a refetch.
   *
   * By default this also arms polling when the list is currently empty, so a run
   * kicked off elsewhere is picked up as it lands. Pass `{ armPolling: false }`
   * for an entry/pagination refetch that should never arm polling merely because
   * the list happens to be empty — polling is then armed only by an explicit
   * `revalidate()` (or `revalidate({ armPolling: true })`) after a run is kicked
   * off.
   */
  revalidate: (options?: RevalidateTestRunsOptions) => Promise<void>;
};
type RevalidateTestRunsOptions = {
  /**
   * Whether to arm polling for the first record when the list is currently
   * empty.
   *
   * @default true
   */
  armPolling?: boolean;
};
/**
 * Subscribes to the list of enterprise-connection test runs for the active organization
 *
 * @internal
 */
declare function useOrganizationEnterpriseConnectionTestRuns(params: UseOrganizationEnterpriseConnectionTestRunsParams): UseOrganizationEnterpriseConnectionTestRunsReturn;
//#endregion
export { UseOrganizationEnterpriseConnectionTestRunsParams, UseOrganizationEnterpriseConnectionTestRunsReturn, useOrganizationEnterpriseConnectionTestRuns };