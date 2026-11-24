#pragma once
#include <cstdint>
#include <vector>

namespace FrontendPipe {

struct Config {
  int n;         // длина блока
  int k;         // кол-во инф бит
  uint64_t poly; // полином

  int model_type;                  // 0 = незав. ошибок, 1 = Гильберт-Эллиотт
  double independant_prob;         // ошибка в режиме независимых ошибок
  double gilbert_good2bad_prob;    // вероятность смены хорошего состояния в плохое
  double gilbert_bad2good_prob;    // вероятность смены плохого состояния в хорошее
  double gilbert_during_bad_prob;  // вероятность ошибки во время плохого
  double gilbert_during_good_prob; // вероятность ошибки во время хорошего

  uint64_t target_errors; // останавливаемся на этом кол-ве необнаруженных ошибок (0 = без лимита ошибок)
  uint64_t block_limit;   // останавливаемся на этом кол-ве блоков
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

} // namespace FrontendPipe
