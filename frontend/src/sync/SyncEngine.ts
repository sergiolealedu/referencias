import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';

import { remoteApi } from '../api/client';
import { getLocalStore } from '../store/LocalSqliteStore';
import type { SyncChange, SyncPushResult, SyncState } from './types';

type SyncListener = (state: SyncState) => void;

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];

class SyncEngine {
  private state: SyncState = {
    lastSyncAt: null,
    pendingCount: 0,
    isOnline: true,
    isSyncing: false,
    lastError: null,
    lastConflicts: [],
  };

  private listeners = new Set<SyncListener>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private started = false;

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): SyncState {
    return this.state;
  }

  private emit(partial: Partial<SyncState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const status = await Network.getStatus();
    this.emit({ isOnline: status.connected });

    await Network.addListener('networkStatusChange', (s) => {
      this.emit({ isOnline: s.connected });
      if (s.connected) {
        void this.sync();
      }
    });

    await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        void this.sync();
      }
    });

    const store = await getLocalStore();
    const lastSync = await store.getSyncMeta('lastSyncAt');
    const pending = await store.pendingChangesCount();
    this.emit({ lastSyncAt: lastSync, pendingCount: pending });

    void this.sync();
  }

  async fullPull(): Promise<void> {
    const store = await getLocalStore();
    const pull = await remoteApi.syncPull();
    await store.clearAllData();

    for (const group of pull.groups) {
      await store.upsertGroup(group);
    }
    for (const item of pull.articles) {
      await store.upsertArticle(item.groupId, item.article, item.updatedAt);
    }

    await store.setSyncMeta('lastSyncAt', pull.serverTime);
    this.emit({
      lastSyncAt: pull.serverTime,
      pendingCount: await store.pendingChangesCount(),
      lastError: null,
      lastConflicts: [],
    });
  }

  async sync(): Promise<void> {
    if (this.state.isSyncing) return;

    const store = await getLocalStore();
    const pending = await store.pendingChangesCount();
    this.emit({ pendingCount: pending });

    if (!this.state.isOnline) return;

    this.emit({ isSyncing: true, lastError: null });

    try {
      await this.pushPending();
      await this.pullIncremental();

      const lastSync = await store.getSyncMeta('lastSyncAt');
      this.emit({
        lastSyncAt: lastSync,
        pendingCount: await store.pendingChangesCount(),
        isSyncing: false,
        lastError: null,
      });
      this.retryAttempt = 0;
    } catch (err) {
      const message = (err as Error).message;
      this.emit({ isSyncing: false, lastError: message });
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const delay = RETRY_DELAYS_MS[Math.min(this.retryAttempt, RETRY_DELAYS_MS.length - 1)];
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.sync();
    }, delay);
  }

  private async pushPending(): Promise<SyncPushResult | null> {
    const store = await getLocalStore();
    const pending = await store.listPendingChanges();
    if (pending.length === 0) return null;

    const changes: SyncChange[] = pending.map((p) => p.payload as SyncChange);
    const result = await remoteApi.syncPush(changes);
    const appliedIdSet = new Set(result.appliedKeys);
    const appliedIds = pending
      .filter((p) => appliedIdSet.has(p.entityId))
      .map((p) => p.id);
    await store.removePendingChanges(appliedIds);

    if (result.conflicts.length > 0) {
      this.emit({ lastConflicts: result.conflicts });
    }

    return result;
  }

  private async pullIncremental(): Promise<void> {
    const store = await getLocalStore();
    const since = await store.getSyncMeta('lastSyncAt');
    const pull = await remoteApi.syncPull(since ?? undefined);

    for (const group of pull.groups) {
      await store.upsertGroup(group);
    }
    for (const item of pull.articles) {
      await store.upsertArticle(item.groupId, item.article, item.updatedAt);
    }

    await store.setSyncMeta('lastSyncAt', pull.serverTime);
  }
}

export const syncEngine = new SyncEngine();
