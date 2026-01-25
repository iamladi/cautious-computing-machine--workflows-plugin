/**
 * Ports - Hexagonal Architecture Interfaces
 *
 * These interfaces define the contracts for external dependencies.
 * Implementations (adapters) can be swapped for testing or different environments.
 */

export * from './github.port';
export * from './claude.port';
export * from './process.port';
