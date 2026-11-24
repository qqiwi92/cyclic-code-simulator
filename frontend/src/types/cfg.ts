export interface SimConfig {
  n: number;
  k: number;
  poly: bigint;
  model_type: number;
  independant_prob: number;
  gilbert_good2bad_prob: number;
  gilbert_bad2good_prob: number;
  gilbert_during_bad_prob: number;
  gilbert_during_good_prob: number;
  target_errors: bigint;
  block_limit: bigint;
}

export interface SimResult {
  total_blocks: bigint;
  detected_errors: bigint;
  undetected_errors: bigint;
  stopped_by_limit: boolean;
}
