import { SimConfig, SimResult } from '@/types/cfg';

export interface SimulatorInstance {
  step(batchSize: bigint): SimResult;
  is_finished(): boolean;
  get_result(): SimResult;
  reset(): void;
  delete(): void;
}

export interface WasmModule {
  Simulator: new (config: SimConfig) => SimulatorInstance;
  run_simulation(config: SimConfig): SimResult;
}

declare function initSimModule(): Promise<WasmModule>;
export default initSimModule;
