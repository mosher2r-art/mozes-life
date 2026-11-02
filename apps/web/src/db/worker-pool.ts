import { Pool, type PoolConfig } from "pg";

/** Supavisor pools upstream connections. Workers must close local sockets after
 * each query/transaction rather than reuse sockets across requests.
 * A real Pool target preserves Drizzle's instanceof check for transactions. */
export function workerPool(config: PoolConfig): Pool {
  return new Proxy(new Pool(config), {
    get(target, key, receiver) {
      if (key === "query") return async (...args: unknown[]) => {
        const pool = new Pool({ ...config, max: 1 });
        try {
          return await Reflect.apply(pool.query, pool, args);
        } finally {
          await pool.end();
        }
      };
      if (key === "connect") return async () => {
        const pool = new Pool({ ...config, max: 1 });
        try {
          const client = await pool.connect();
          const release = client.release.bind(client);
          let released = false;
          client.release = (error?: Error | boolean) => {
            if (released) return;
            released = true;
            release(error);
            void pool.end();
          };
          return client;
        } catch (error) {
          await pool.end();
          throw error;
        }
      };
      return Reflect.get(target, key, receiver);
    },
  });
}
