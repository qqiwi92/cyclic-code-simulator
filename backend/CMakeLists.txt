cmake_minimum_required(VERSION 3.28)
project(coding_sim LANGUAGES CXX)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if (EMSCRIPTEN)
    add_executable(sim_wasm
        implementation.cpp
        bindings.cpp
    )
    target_include_directories(sim_wasm PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
    set_target_properties(sim_wasm PROPERTIES
        OUTPUT_NAME "sim"
        SUFFIX ".js"
        LINK_FLAGS "-sWASM_BIGINT=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sSINGLE_FILE=1 -sENVIRONMENT='web,worker' --bind -O3"
    )
else()
    add_executable(sim_test)
    target_sources(sim_test
        PUBLIC
            FILE_SET CXX_MODULES FILES
                contract.cppm
        PRIVATE
            main.cpp
            implementation.cpp
    )
endif()
