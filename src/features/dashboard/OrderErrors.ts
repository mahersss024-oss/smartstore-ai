export class OrderConcurrencyError extends Error {
  constructor() {
    super('Order state changed while the action was being processed');
    this.name = 'OrderConcurrencyError';
  }
}
