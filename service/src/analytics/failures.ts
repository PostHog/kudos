export async function failuresLogged<T>(code: string, run: () => Promise<T>, fields: Record<string, string> = {}): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(code, { ...fields, error: error instanceof Error ? error.name : typeof error });
    throw error;
  }
}
