#ifndef __EMSCRIPTEN__
module;

#include <bit>
#include <cstdint>
#include <random>
#include <stdexcept>
#include <vector>

module contract;
#else
#include "contract.hpp"
#include <bit>
#include <cstdint>
#include <random>
#include <stdexcept>
#include <vector>
#endif

namespace FrontendPipe {

void validate_probability(double probability)
{
  if (!(0.0 <= probability && probability <= 1.0)) {
    throw std::invalid_argument("Channel probabilities must be in [0, 1]");
  }
}

void validate_config(const Config& cfg)
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

uint64_t Simulator::compute_remainder(const std::vector<bool>& block) const
{
  uint64_t value = 0;
  for (bool bit : block) {
    value = (value << 1) | (bit ? 1ULL : 0ULL);
    if ((value & leading_bit) != 0) {
      value ^= cfg.poly;
    }
  }
  return value;
}

Simulator::Simulator(const Config& config)
  : cfg(config),
    leading_bit(uint64_t{1} << (config.n - config.k)),
    result{},
    finished(false),
    bad_state(false)
{
  validate_config(cfg);
}

void Simulator::reset()
{
  result = Result{};
  finished = false;
  bad_state = false;
}

bool Simulator::is_finished() const
{
  return finished;
}

Result Simulator::get_result() const
{
  return result;
}

Result Simulator::step(uint64_t batch_size)
{
  if (finished) {
    return result;
  }

  std::random_device rd;
  std::mt19937 gen(rd());
  std::uniform_real_distribution<double> real_dist(0.0, 1.0);
  std::uniform_int_distribution<int> bit_dist(0, 1);

  std::vector<bool> block(cfg.n, false);
  std::vector<bool> original_data(cfg.k, false);

  uint64_t processed = 0;

  while ((cfg.block_limit == 0 || result.total_blocks < cfg.block_limit) &&
         (batch_size == 0 || processed < batch_size)) {
    // 1. Generate k random information bits
    for (int i = 0; i < cfg.k; ++i) {
      bool b = bit_dist(gen) != 0;
      block[i] = b;
      original_data[i] = b;
    }
    for (int i = cfg.k; i < cfg.n; ++i) {
      block[i] = false;
    }

    // 2. Encode: calculate remainder on block and place in check bits [k .. n-1]
    uint64_t check_bits = compute_remainder(block);
    for (int i = cfg.n - 1; i >= cfg.k; --i) {
      block[i] = (check_bits & 1ULL) != 0;
      check_bits >>= 1;
    }

    // 3. Transmit through channel
    if (cfg.model_type == 0) {
      for (int i = 0; i < cfg.n; ++i) {
        if (real_dist(gen) < cfg.independant_prob) {
          block[i] = !block[i];
        }
      }
    } else {
      for (int i = 0; i < cfg.n; ++i) {
        const double error_prob = bad_state ? cfg.gilbert_during_bad_prob
                                            : cfg.gilbert_during_good_prob;
        if (real_dist(gen) < error_prob) {
          block[i] = !block[i];
        }
        const double transition_prob = bad_state ? cfg.gilbert_bad2good_prob
                                                 : cfg.gilbert_good2bad_prob;
        if (real_dist(gen) < transition_prob) {
          bad_state = !bad_state;
        }
      }
    }

    // 4. Receiver: syndrome check
    const bool detected_error = compute_remainder(block) != 0;
    ++result.total_blocks;
    ++processed;

    if (detected_error) {
      ++result.detected_errors;
    } else {
      bool data_corrupted = false;
      for (int i = 0; i < cfg.k; ++i) {
        if (block[i] != original_data[i]) {
          data_corrupted = true;
          break;
        }
      }
      if (data_corrupted) {
        ++result.undetected_errors;
      }
    }

    // Check target errors limit (stopping on undetected errors)
    if (cfg.target_errors != 0 && result.undetected_errors >= cfg.target_errors) {
      finished = true;
      result.stopped_by_limit = false;
      return result;
    }
  }

  if (cfg.block_limit != 0 && result.total_blocks >= cfg.block_limit) {
    finished = true;
    result.stopped_by_limit = true;
  }

  return result;
}

Result run(const Config& cfg)
{
  Simulator sim(cfg);
  while (!sim.is_finished()) {
    sim.step(100000);
  }
  return sim.get_result();
}

} // namespace FrontendPipe
