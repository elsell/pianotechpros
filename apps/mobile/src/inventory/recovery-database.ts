export interface RecoveryDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: string[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, ...params: string[]): Promise<T | null>;
}

export async function createRecoveryDatabase(db: RecoveryDatabase) {
  await db.execAsync(`PRAGMA journal_mode=WAL;
    PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS recovery_v1 (
      address TEXT PRIMARY KEY NOT NULL, ciphertext TEXT NOT NULL
    );`);
  return {
    async read(key: string) {
      const row = await db.getFirstAsync<{ ciphertext: string }>(
        'SELECT ciphertext FROM recovery_v1 WHERE address = ?', key,
      );
      return row?.ciphertext ?? null;
    },
    async write(key: string, value: string) {
      await db.runAsync(
        'INSERT INTO recovery_v1 (address,ciphertext) VALUES (?,?) ON CONFLICT(address) DO UPDATE SET ciphertext=excluded.ciphertext',
        key, value,
      );
    },
    async remove(key: string) {
      await db.runAsync('DELETE FROM recovery_v1 WHERE address = ?', key);
    },
    async clear() {
      await db.execAsync('DELETE FROM recovery_v1;');
    },
  };
}
