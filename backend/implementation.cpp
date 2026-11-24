#include <random>
#include <vector>

import contract;

class Generator
{
  const FrontendPipe::Config& cfg;
  std::random_device rd;
public:
  Generator(const FrontendPipe::Config& config):
    cfg(config)
  {}
  std::vector< bool > generate_block()
  {
    std::mt19937 gen(rd());
    std::uniform_int_distribution<int> dist(0, 1);
    std::vector< bool > block(cfg.n);
    for (int i = 0; i < cfg.n; ++i) {
      block[i] = dist(gen);
    }
    return block;
  }
};

FrontendPipe::Result run(const FrontendPipe::Config& cfg)
{
  Generator gen(cfg);
  FrontendPipe::Result result{};
  return result;
}
