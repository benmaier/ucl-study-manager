/**
 * Worker thread used by cli/generate-participants-bulk.ts.
 *
 * Receives a batch of plaintext passwords on the parent port, returns
 * the bcrypt-hashed equivalents. Pure CPU work; spread across cores so
 * generating 100k participants doesn't take an hour on one thread.
 */
import { parentPort } from "node:worker_threads";
import bcrypt from "bcryptjs";

if (!parentPort) {
  throw new Error("bcrypt-worker.ts must be loaded as a Node worker_thread");
}

parentPort.on(
  "message",
  async (msg: { plaintexts: string[]; cost: number }) => {
    const hashes: string[] = [];
    for (const pw of msg.plaintexts) {
      hashes.push(await bcrypt.hash(pw, msg.cost));
    }
    parentPort!.postMessage({ hashes });
  },
);
