import { Faker, pt_BR } from '@faker-js/faker';

const DEFAULT_TEST_FAKER_SEED = 20261125;

/**
 * Cria uma instância isolada do Faker localizada em português do Brasil.
 *
 * @param seed - Seed fixa para reproduzir os dados auxiliares de cada teste.
 * @returns Instância independente do Faker configurada para `pt_BR`.
 */
export function createTestFaker(seed = DEFAULT_TEST_FAKER_SEED): Faker {
  const faker = new Faker({ locale: [pt_BR] });
  faker.seed(seed);
  return faker;
}
