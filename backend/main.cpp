#include <iostream>
#include <chrono>
import contract;

int main() {
  FrontendPipe::Config cfg{};
  cfg.n = 15;
  cfg.k = 10;
  cfg.poly = (1ULL << 5) | (1ULL << 3) | 1ULL; // 0b101001 = 41
  cfg.model_type = 0;
  cfg.independant_prob = 0.01;
  cfg.block_limit = 100000;
  cfg.target_errors = 0;

  auto t1 = std::chrono::high_resolution_clock::now();
  auto res = FrontendPipe::run(cfg);
  auto t2 = std::chrono::high_resolution_clock::now();

  std::cout << "Done in " << std::chrono::duration_cast<std::chrono::milliseconds>(t2 - t1).count() << "ms\n";
  std::cout << "Total blocks: " << res.total_blocks << "\n";
  std::cout << "Detected errors: " << res.detected_errors << "\n";
  std::cout << "Undetected errors: " << res.undetected_errors << "\n";
  std::cout << "Stopped by limit: " << res.stopped_by_limit << "\n";
  return 0;
}
