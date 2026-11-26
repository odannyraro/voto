import { apiRequestWithBody } from './api-client';

/**
 * Response returned by the public health endpoint.
 */
export interface HealthDTO {
  /** Indicates that the API is accepting requests. */
  readonly status: 'ok';
}

/**
 * REST operations that do not require an administrator or voter session.
 */
export const publicApi = {
  /**
   * Checks whether the API is available.
   *
   * @returns The API health status.
   */
  getHealth(): Promise<HealthDTO> {
    return apiRequestWithBody('/health');
  },
};
