module;

#include <bit>
#include <cstdint>
#include <random>
#include <stdexcept>
#include <utility>
#include <vector>

module contract;

namespace {

class Generator
{
  const FrontendPipe::Config& cfg;
  std::mt19937 gen{std::random_device{}()};
public:
  Generator(const FrontendPipe::Config& config):
    cfg(config)
  {}
  std::vector< bool > generate_block()
  {
    std::uniform_int_distribution<int> dist(0, 1);
    std::vector< bool > block(cfg.k);
    for (int i = 0; i < cfg.k; ++i) {
      block[i] = dist(gen);
    }
    return block;
  }
};

uint64_t remainder(const std::vector< bool >& block, const FrontendPipe::Config& cfg)
{
  const uint64_t leading_bit = uint64_t{1} << (cfg.n - cfg.k);
  uint64_t value = 0;
  for (bool bit : block) {
    value = (value << 1) | bit;
    if ((value & leading_bit) != 0) {
      value ^= cfg.poly;
    }
  }
  return value;
}

class ControlBitGenerator
{
  const FrontendPipe::Config& cfg;
public:
  ControlBitGenerator(const FrontendPipe::Config& config):
    cfg(config)
  {}
  std::vector< bool > encode(std::vector< bool > block)
  {
    block.resize(cfg.n);
    uint64_t check_bits = remainder(block, cfg);
    for (int i = cfg.n - 1; i >= cfg.k; --i) {
      block[i] = (check_bits & 1) != 0;
      check_bits >>= 1;
    }
    return block;
  }
};

class ErrorChannel
{
  const FrontendPipe::Config& cfg;
  std::mt19937 gen{std::random_device{}()};
  std::uniform_real_distribution<double> dist{0.0, 1.0};
  bool bad_state = false;
public:
  ErrorChannel(const FrontendPipe::Config& config):
    cfg(config)
  {}
  void transmit(std::vector< bool >& block)
  {
    if (cfg.model_type == 0) {
      for (auto bit : block) {
        if (dist(gen) < cfg.independant_prob) {
          bit.flip();
        }
      }
      return;
    }

    for (auto bit : block) {
      const double error_prob = bad_state ? cfg.gilbert_during_bad_prob
                                          : cfg.gilbert_during_good_prob;
      if (dist(gen) < error_prob) {
        bit.flip();
      }
      const double transition_prob = bad_state ? cfg.gilbert_bad2good_prob
                                               : cfg.gilbert_good2bad_prob;
      if (dist(gen) < transition_prob) {
        bad_state = !bad_state;
      }
    }
  }
};

class Receiver
{
  const FrontendPipe::Config& cfg;
public:
  Receiver(const FrontendPipe::Config& config):
    cfg(config)
  {}
  std::pair<std::vector< bool >, bool> receive(std::vector< bool > block)
  {
    const bool detected_error = remainder(block, cfg) != 0;
    block.resize(cfg.k);
    return {std::move(block), detected_error};
  }
};

void validate_probability(double probability)
{
  if (!(0.0 <= probability && probability <= 1.0)) {
    throw std::invalid_argument("Channel probabilities must be in [0, 1]");
  }
}

void validate_config(const FrontendPipe::Config& cfg)
{
  if (cfg.k <= 0 || cfg.n <= cfg.k ||
      std::bit_width(cfg.poly) - 1 != cfg.n - cfg.k || (cfg.poly & 1) == 0) {
    throw std::invalid_argument("Invalid block lengths or generator polynomial");
  }
  if (cfg.model_type == 0) {
    validate_probability(cfg.independant_prob);
  } else if (cfg.model_type == 1) {
    validate_probability(cfg.gilbert_good2bad_prob);
    validate_probability(cfg.gilbert_bad2good_prob);
    validate_probability(cfg.gilbert_during_bad_prob);
    validate_probability(cfg.gilbert_during_good_prob);
  } else {
    throw std::invalid_argument("Unknown channel model");
  }
  if (cfg.block_limit == 0 && cfg.target_errors == 0) {
    throw std::invalid_argument("Set a block limit or a target number of errors");
  }
}

}

FrontendPipe::Result run(const FrontendPipe::Config& cfg)
{
  validate_config(cfg);
  Generator gen(cfg);
  ControlBitGenerator encoder(cfg);
  ErrorChannel channel(cfg);
  Receiver receiver(cfg);
  FrontendPipe::Result result{};

  while (cfg.block_limit == 0 || result.total_blocks < cfg.block_limit) {
    const auto data = gen.generate_block();
    auto block = encoder.encode(data);
    channel.transmit(block);
    const auto [received_data, detected_error] = receiver.receive(std::move(block));
    ++result.total_blocks;
    if (detected_error) {
      ++result.detected_errors;
    } else if (received_data != data) {
      ++result.undetected_errors;
    }
    if (cfg.target_errors != 0 &&
        result.detected_errors + result.undetected_errors >= cfg.target_errors) {
      return result;
    }
  }
  result.stopped_by_limit = true;
  return result;
}
