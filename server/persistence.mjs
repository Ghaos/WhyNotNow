const DEFAULT_RETRY_DELAYS_MS = [25, 75, 225];

function retryable(work, delays) {
  return (async () => {
    let lastError;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      try {
        return await work();
      } catch (error) {
        lastError = error;
        if (error?.code === "REVISION_CONFLICT") break;
        if (attempt < delays.length - 1) await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
    throw lastError;
  })();
}

export class PersistenceQueue {
  constructor({ create, update, retryDelaysMs = DEFAULT_RETRY_DELAYS_MS }) {
    this.create = create;
    this.update = update;
    this.retryDelaysMs = retryDelaysMs;
    this.states = new Map();
  }

  stateFor(conversationId) {
    let state = this.states.get(conversationId);
    if (!state) {
      state = { pending: [], running: null, nextRevision: undefined, failure: null, failureNotified: false };
      this.states.set(conversationId, state);
    }
    return state;
  }

  queueCreate(conversationId, input) {
    const state = this.stateFor(conversationId);
    if (state.nextRevision !== undefined || state.pending.length) throw new Error("Conversation is already queued");
    state.nextRevision = 1;
    state.pending.push(() => this.create(input, { id: conversationId }));
    this.kick(conversationId);
    return { revision: 1 };
  }

  queueUpdate(conversationId, input, expectedRevision) {
    const state = this.stateFor(conversationId);
    const idle = !state.running && state.pending.length === 0;
    if (state.nextRevision !== undefined && expectedRevision !== state.nextRevision) {
      if (idle && expectedRevision > state.nextRevision) {
        state.nextRevision = expectedRevision;
      } else {
        const error = new Error(`Revision conflict: expected ${expectedRevision}, queued revision is ${state.nextRevision}`);
        error.code = "REVISION_CONFLICT";
        throw error;
      }
    }
    state.nextRevision = expectedRevision;
    state.pending.push(() => this.update(conversationId, input, { expectedRevision }));
    state.nextRevision += 1;
    this.kick(conversationId);
    return { revision: state.nextRevision };
  }

  kick(conversationId) {
    const state = this.stateFor(conversationId);
    if (state.running) return state.running;
    state.running = (async () => {
      while (state.pending.length) {
        const operation = state.pending[0];
        try {
          await retryable(operation, this.retryDelaysMs);
          state.pending.shift();
          state.failure = null;
        } catch (error) {
          state.failure = error;
          if (error?.code === "REVISION_CONFLICT") {
            state.pending = [];
            state.nextRevision = undefined;
          }
          return;
        }
      }
    })().finally(() => { state.running = null; });
    return state.running;
  }

  async flush(conversationId) {
    const state = this.states.get(conversationId);
    if (!state) return;
    await this.kick(conversationId);
    if (state.failure) throw state.failure;
  }

  async flushAll() {
    await Promise.all([...this.states.keys()].map((conversationId) => this.flush(conversationId)));
  }

  takeFailureNotice(conversationId) {
    const state = this.states.get(conversationId);
    if (!state?.failure || state.failureNotified) return false;
    state.failureNotified = true;
    return true;
  }

  clearFailure(conversationId) {
    const state = this.states.get(conversationId);
    if (!state) return;
    state.failure = null;
    state.failureNotified = false;
  }
}
