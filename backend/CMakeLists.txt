cmake_minimum_required(VERSION 3.28)
project(coding_sim LANGUAGES CXX)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(sim_test)

target_sources(sim_test
    PUBLIC
        FILE_SET CXX_MODULES FILES
            contract.cppm
    PRIVATE
        main.cpp
        implementation.cpp
)