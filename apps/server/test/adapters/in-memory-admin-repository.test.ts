import { InMemoryAdminRepository } from '../../src/adapters/in-memory-admin-repository';
import { describeAdminRepositoryContract } from '../contracts/admin-repository.contract';

describeAdminRepositoryContract('InMemoryAdminRepository', () => new InMemoryAdminRepository());
