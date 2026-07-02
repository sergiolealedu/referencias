export class StoreError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'IO_ERROR' | 'VALIDATION',
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

/** @deprecated use StoreError */
export { StoreError as JsonStoreError };
