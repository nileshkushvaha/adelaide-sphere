export const databaseCode = (error: unknown): string | undefined =>
  error !== null && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined;
/** Only retry a transaction known to have rolled back; never external effects. */
export async function retryTransaction<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (databaseCode(error) !== 'P2034' || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}
