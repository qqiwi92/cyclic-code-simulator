module;
#include <cstdint>

export module contract;

export namespace FrontendPipe {
  struct Config {
    int n;         // длина блока
    int k;         // кол-во инф бит
    uint64_t poly; // полином

    int model_type;                  // гильберт / незав. ошибок
    double independant_prob;         // ошибка в режиме независимых ошибкок
    double gilbert_good2bad_prob;    // вероятность смены хорошего состояния в плохое
    double gilbert_bad2good_prob;    // вероятность смены плохого состояния в хорошее
    double gilbert_during_bad_prob;  // вероятность ошибки во время плохого
    double gilbert_during_good_prob; // вероятность ошибки во время хорошего

    uint64_t target_errors; // останавливаемося на этом кол-ве ошибок
    uint16_t block_limit;   // останавливаемся на этом кол-ве блоков
  };

  struct Result {
    uint64_t total_blocks;
    uint64_t detected_errors;
    uint64_t undetected_errors;
    bool stopped_by_limit;
  };
}
