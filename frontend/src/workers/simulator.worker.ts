import initSimModule, { type WasmModule, type SimulatorInstance } from '@/wasm/sim';
import type { SimConfig } from '@/types/cfg';

let wasmModule: WasmModule | null = null;
let currentSimulator: SimulatorInstance | null = null;
let isCancelled = false;

async function getModule(): Promise<WasmModule> {
  if (!wasmModule) {
    wasmModule = await initSimModule();
  }
  return wasmModule;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, id, config, batchSize = 50000 } = e.data;

  if (type === 'cancel') {
    isCancelled = true;
    return;
  }

  if (type === 'start') {
    isCancelled = false;
    try {
      const mod = await getModule();
      if (currentSimulator) {
        try {
          currentSimulator.delete();
        } catch {}
        currentSimulator = null;
      }

      currentSimulator = new mod.Simulator(config as SimConfig);
      const bSize = BigInt(batchSize);

      while (!currentSimulator.is_finished() && !isCancelled) {
        const stepRes = currentSimulator.step(bSize);
        self.postMessage({
          type: 'progress',
          id,
          data: {
            currentBlocks: Number(stepRes.total_blocks),
            detectedErrors: Number(stepRes.detected_errors),
            undetectedErrors: Number(stepRes.undetected_errors),
          },
        });

        await new Promise((r) => setTimeout(r, 0));
      }

      const finalRes = currentSimulator.get_result();
      const stoppedReason = isCancelled
        ? 'manual'
        : finalRes.stopped_by_limit
          ? 'limit_blocks'
          : 'limit_errors';

      self.postMessage({
        type: 'done',
        id,
        data: {
          totalBlocks: Number(finalRes.total_blocks),
          detectedErrors: Number(finalRes.detected_errors),
          undetectedErrors: Number(finalRes.undetected_errors),
          stoppedReason,
        },
      });
    } catch (err: any) {
      self.postMessage({
        type: 'error',
        id,
        message: err?.message || String(err),
      });
    } finally {
      if (currentSimulator) {
        try {
          currentSimulator.delete();
        } catch {}
        currentSimulator = null;
      }
    }
  }
};
