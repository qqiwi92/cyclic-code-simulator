module;
#include <cstdint>
#include <vector>

export module contract;

export namespace FrontendPipe {

struct Config {
  int n;
  int k;
  uint64_t poly;

  int model_type;
  double independant_prob;
  double gilbert_good2bad_prob;
  double gilbert_bad2good_prob;
  double gilbert_during_bad_prob;
  double gilbert_during_good_prob;

  uint64_t target_errors;
  uint64_t block_limit;
};

struct Result {
  uint64_t total_blocks;
  uint64_t detected_errors;
  uint64_t undetected_errors;
  bool stopped_by_limit;
};

void validate_config(const Config& cfg);

class Simulator {
private:
  Config cfg;
  uint64_t leading_bit = 0;
  Result result{};
  bool finished = false;
  bool bad_state = false;

  uint64_t compute_remainder(const std::vector<bool>& block) const;

public:
  explicit Simulator(const Config& config);

  Result step(uint64_t batch_size);
  bool is_finished() const;
  Result get_result() const;
  void reset();
};

Result run(const Config& cfg);

}
