import type { PersistedSessionStatus, Session } from '../types';
import {
  SessionRepository,
  type SessionQuery,
  type SessionUpdate,
  sessionRepository,
} from './db.service.ts';

export class SessionService {
  private readonly repository: SessionRepository;

  constructor(repository: SessionRepository) {
    this.repository = repository;
  }

  create(session: Session): Promise<Session> {
    return this.repository.create(session);
  }

  getById(id: string): Promise<Session | null> {
    return this.repository.getById(id);
  }

  list(query: SessionQuery = {}): Promise<Session[]> {
    return this.repository.list(query);
  }

  update(id: string, changes: SessionUpdate): Promise<Session> {
    return this.repository.update(id, changes);
  }

  complete(id: string, endedAt: string, elapsedSeconds: number): Promise<void> {
    return this.repository.complete(id, endedAt, elapsedSeconds);
  }

  cancel(id: string, endedAt: string, elapsedSeconds: number): Promise<void> {
    return this.repository.cancel(id, endedAt, elapsedSeconds);
  }

  interruptUnfinished(endedAt?: string): Promise<number> {
    return this.repository.interruptUnfinished(endedAt);
  }

  delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  getAll(options: {
    status?: PersistedSessionStatus;
    startedAfter?: string;
    startedBefore?: string;
    order?: 'asc' | 'desc';
  } = {}): Promise<Session[]> {
    return this.repository.getAll(options);
  }

  getRecent(limit = 10): Promise<Session[]> {
    return this.repository.list({ limit, order: 'desc' });
  }

  count(status?: PersistedSessionStatus): Promise<number> {
    return this.repository.count(status);
  }
}

export const sessionService = new SessionService(sessionRepository);
