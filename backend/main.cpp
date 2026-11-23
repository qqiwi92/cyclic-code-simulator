#include <iostream>
import contract;

int main() {
  FrontendPipe::Config cfg{};
  cfg.n = 15;
  cfg.k = 10;
  cfg.block_limit = 10'000'000;

  std::cout << "Total blocks: " << cfg.block_limit << "\n ";
  return 0;
}