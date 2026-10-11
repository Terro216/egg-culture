/** A run owns its ticket until completion. Pausing and resuming never call start. */
export class RoadSession<T> {
  ticket: T | null = null;
  private completed = true;
  private readonly create: () => T;
  constructor(create: () => T) { this.create = create; }
  start() { this.ticket = this.create(); this.completed = false; return this.ticket; }
  finish(): T | null {
    if (this.completed || !this.ticket) return null;
    this.completed = true;
    return this.ticket;
  }
}
