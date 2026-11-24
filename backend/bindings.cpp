#include <emscripten/bind.h>
#include "contract.hpp"

EMSCRIPTEN_BINDINGS(cyclic_code_module) {
  emscripten::value_object<FrontendPipe::Config>("SimConfig")
    .field("n", &FrontendPipe::Config::n)
    .field("k", &FrontendPipe::Config::k)
    .field("poly", &FrontendPipe::Config::poly)
    .field("model_type", &FrontendPipe::Config::model_type)
    .field("independant_prob", &FrontendPipe::Config::independant_prob)
    .field("gilbert_good2bad_prob", &FrontendPipe::Config::gilbert_good2bad_prob)
    .field("gilbert_bad2good_prob", &FrontendPipe::Config::gilbert_bad2good_prob)
    .field("gilbert_during_bad_prob", &FrontendPipe::Config::gilbert_during_bad_prob)
    .field("gilbert_during_good_prob", &FrontendPipe::Config::gilbert_during_good_prob)
    .field("target_errors", &FrontendPipe::Config::target_errors)
    .field("block_limit", &FrontendPipe::Config::block_limit);

  emscripten::value_object<FrontendPipe::Result>("SimResult")
    .field("total_blocks", &FrontendPipe::Result::total_blocks)
    .field("detected_errors", &FrontendPipe::Result::detected_errors)
    .field("undetected_errors", &FrontendPipe::Result::undetected_errors)
    .field("stopped_by_limit", &FrontendPipe::Result::stopped_by_limit);

  emscripten::class_<FrontendPipe::Simulator>("Simulator")
    .constructor<FrontendPipe::Config>()
    .function("step", &FrontendPipe::Simulator::step)
    .function("is_finished", &FrontendPipe::Simulator::is_finished)
    .function("get_result", &FrontendPipe::Simulator::get_result)
    .function("reset", &FrontendPipe::Simulator::reset);

  emscripten::function("run_simulation", &FrontendPipe::run);
}
