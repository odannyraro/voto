import { InMemoryElectionRepository } from '../../src/adapters/in-memory-election-repository';
import { describeElectionRepositoryContract } from '../contracts/election-repository.contract';

describeElectionRepositoryContract(
  'InMemoryElectionRepository',
  () => new InMemoryElectionRepository(),
);
