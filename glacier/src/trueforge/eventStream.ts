import { TurnStreamingEvent } from './types';

export class EventStream implements AsyncIterable<TurnStreamingEvent> {
  private queue: TurnStreamingEvent[] = [];
  private resolvers: ((value: IteratorResult<TurnStreamingEvent>) => void)[] = [];
  private done = false;
  private error: Error | null = null;
  private abortController: AbortController;
  private listeners: Map<string, Array<(event: TurnStreamingEvent) => void>> = new Map();

  constructor(abortController: AbortController) {
    this.abortController = abortController;
  }

  public push(event: TurnStreamingEvent): void {
    if (this.done) {
      return;
    }

    this.emit(event.type, event);
    this.emit('*', event);

    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  public finish(): void {
    if (this.done) {
      return;
    }
    this.done = true;
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value: undefined as any, done: true });
    }
  }

  public fail(err: Error): void {
    if (this.done) {
      return;
    }
    this.error = err;
    this.done = true;
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value: undefined as any, done: true });
    }
  }

  public on(type: string, listener: (event: TurnStreamingEvent) => void): this {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
    return this;
  }

  public emit(type: string, event: TurnStreamingEvent): void {
    const list = this.listeners.get(type);
    if (list) {
      for (const fn of list) {
        try {
          fn(event);
        } catch (e) {
          console.error('Error in EventStream listener:', e);
        }
      }
    }
  }

  public cancel(): void {
    this.abortController.abort();
    this.finish();
  }

  [Symbol.asyncIterator](): AsyncIterator<TurnStreamingEvent> {
    return {
      next: (): Promise<IteratorResult<TurnStreamingEvent>> => {
        if (this.queue.length > 0) {
          const val = this.queue.shift()!;
          return Promise.resolve({ value: val, done: false });
        }
        if (this.error) {
          return Promise.reject(this.error);
        }
        if (this.done) {
          return Promise.resolve({ value: undefined as any, done: true });
        }
        return new Promise<IteratorResult<TurnStreamingEvent>>((resolve) => {
          this.resolvers.push(resolve);
        });
      }
    };
  }
}
