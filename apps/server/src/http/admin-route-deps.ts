import type { Clock } from '../ports';
import type { ElectionService } from '../services/election-service';
import type { AuthHooks } from './auth-plugin';

/** O que as rotas de admin sobre eleições (eleição, cargos, candidatos, eleitores) precisam. */
export interface AdminRouteDeps {
  readonly service: ElectionService;
  /** Fornece o `serverNow` das respostas. */
  readonly clock: Clock;
  readonly hooks: AuthHooks;
}

/** Parâmetros de rota `/elections/:id`, base dos parâmetros das sub-rotas. */
export interface ElectionParams {
  readonly id: string;
}
