import { TurnStreamingEvent } from './types';

interface StreamResolver {
  resolve: (value: IteratorResult<TurnStreamingEvent>) => void;
  reject: (err: any) => void;
}

export class EventStream implements AsyncIterable<TurnStreamingEvent> {
  private queue: TurnStreamingEvent[] = [];
  private resolvers: StreamResolver[] = [];
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
      const waiter = this.resolvers.shift()!;
      waiter.resolve({ value: event, done: false });
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
      const waiter = this.resolvers.shift()!;
      waiter.resolve({ value: undefined as any, done: true });
    }
  }

  public fail(err: Error): void {
    if (this.done) {
      return;
    }
    this.error = err;
    this.done = true;
    while (this.resolvers.length > 0) {
      const waiter = this.resolvers.shift()!;
      waiter.reject(err);
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
        return new Promise<IteratorResult<TurnStreamingEvent>>((resolve, reject) => {
          this.resolvers.push({ resolve, reject });
        });
      }
    };
  }
}
