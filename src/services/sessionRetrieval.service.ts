import type { PersistedSessionStatus, Session } from '../types';
import {
  SessionRepository,
  isValidSessionId,
  sessionRepository,
} from './db.service.ts';

export interface SessionRetrievalOptions {
  status?: PersistedSessionStatus;
  startedAfter?: string;
  startedBefore?: string;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

export type RetrievalResult<T> =
  | { success: true; data: T; error?: never }
  | { success: false; data: T; error: string };

/**
 * Service dedicated to retrieving saved focus sessions from the local SQLite database.
 * Provides both standard Promise-based queries and safe result-wrapped methods
 * suitable for future UI components without throwing uncaught errors.
 */
export class SessionRetrievalService {
  private readonly repository: SessionRepository;

  constructor(repository: SessionRepository = sessionRepository) {
    this.repository = repository;
  }

  /**
   * Validate a session ID according to FocusLens conventions (UUID v1-v8).
   */
  isValidSessionId(id: unknown): id is string {
    return isValidSessionId(id);
  }

  /**
   * Retrieve all saved sessions matching the given options.
   * If limit is omitted, retrieves all saved sessions ordered by start time.
   * If the database is empty, returns an empty array [].
   */
  async getAllSessions(options: SessionRetrievalOptions = {}): Promise<Session[]> {
    if (options.limit !== undefined || options.offset !== undefined) {
      return this.repository.list(options);
    }
    return this.repository.getAll(options);
  }

  /**
   * Retrieve an individual saved session by its ID.
   * Validates the ID format before querying.
   * Returns null if not found.
   */
  async getSessionById(id: string): Promise<Session | null> {
    if (!this.isValidSessionId(id)) {
      throw new Error(`Invalid session ID: "${id}". Expected a valid UUID.`);
    }
    return this.repository.getById(id);
  }

  /**
   * Convenience method to retrieve the N most recent saved sessions.
   * Defaults to 10 sessions.
   */
  async getRecentSessions(limit = 10): Promise<Session[]> {
    return this.repository.list({ limit, order: 'desc' });
  }

  /**
   * Convenience method to retrieve sessions filtered by status.
   */
  async getSessionsByStatus(
    status: PersistedSessionStatus,
    limit?: number,
  ): Promise<Session[]> {
    return this.getAllSessions({ status, limit });
  }

  /**
   * Retrieve total count of saved sessions, optionally filtered by status.
   */
  async getSessionCount(status?: PersistedSessionStatus): Promise<number> {
    return this.repository.count(status);
  }

  /**
   * Quick check whether any sessions exist in the local database.
   */
  async hasSessions(): Promise<boolean> {
    const count = await this.getSessionCount();
    return count > 0;
  }

  /**
   * Safe retrieval method that returns a typed result object and never throws,
   * handling database errors and invalid parameters gracefully for future UI components.
   */
  async getAllSessionsResult(
    options: SessionRetrievalOptions = {},
  ): Promise<RetrievalResult<Session[]>> {
    try {
      const data = await this.getAllSessions(options);
      return { success: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve saved focus sessions.';
      return { success: false, data: [], error: message };
    }
  }

  /**
   * Safe individual session retrieval method that returns a typed result object
   * without crashing on database errors or invalid session IDs.
   */
  async getSessionByIdResult(id: unknown): Promise<RetrievalResult<Session | null>> {
    if (typeof id !== 'string' || !this.isValidSessionId(id)) {
      return {
        success: false,
        data: null,
        error: `Invalid session ID: "${String(id)}". Must be a valid UUID.`,
      };
    }

    try {
      const data = await this.repository.getById(id);
      return { success: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to retrieve focus session "${id}".`;
      return { success: false, data: null, error: message };
    }
  }

  /**
   * Safe recent sessions retrieval method.
   */
  async getRecentSessionsResult(limit = 10): Promise<RetrievalResult<Session[]>> {
    return this.getAllSessionsResult({ limit, order: 'desc' });
  }

  /**
   * Safe status-filtered sessions retrieval method.
   */
  async getSessionsByStatusResult(
    status: PersistedSessionStatus,
    limit?: number,
  ): Promise<RetrievalResult<Session[]>> {
    return this.getAllSessionsResult({ status, limit });
  }

  /**
   * Safe session count retrieval method.
   */
  async getSessionCountResult(status?: PersistedSessionStatus): Promise<RetrievalResult<number>> {
    try {
      const data = await this.getSessionCount(status);
      return { success: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retrieve session count.';
      return { success: false, data: 0, error: message };
    }
  }
}

export const sessionRetrievalService = new SessionRetrievalService(sessionRepository);
