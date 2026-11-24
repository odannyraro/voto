// Portas da aplicação (architecture.md §8.1): fronteiras que os testes trocam por doubles.
export type { Admin, AdminRepository } from './admin-repository';
export type { Clock } from './clock';
export type { CodeGenerator } from './code-generator';
export type { ElectionRecord, ElectionRepository, VoterCodeOwner } from './election-repository';
export type { Notifier } from './notifier';
export type { ScheduledTask, Scheduler } from './scheduler';
export type { Logger } from './logger';
