# Cyclic Code Simulator (crclabmod)

Моделирование передачи данных с использованием циклических кодов в канале связи (независимые ошибки и модель Гильберта-Эллиотта).

## Архитектура

- **C++ Backend**: Реализация моделирования циклических кодов (GF(2) деление полиномов, генерация кодовых слов, каналы с ошибками, обнаружение ошибок). Поддерживает C++20 Modules (`contract.cppm`) для нативной сборки.
- **Emscripten WebAssembly (Wasm)**: Обвязка через Embind (`backend/bindings.cpp`), компилирующая C++ ядро в WebAssembly модуль с поддержкой `WASM_BIGINT` и инкрементального пошагового моделирования (`Simulator::step`).
- **React Frontend**: Интерфейс для настройки параметров кода, выбора модели канала, управления процессом моделирования, отображения прогресса в реальном времени и экспорта результатов в CSV.

---

## Сборка и запуск

### 1. Сборка WebAssembly (для фронтенда)

Требуется: [Emscripten SDK](https://emscripten.org/) (`emcc`).

```bash
# Из папки frontend:
cd frontend
npm run build:wasm

# Или напрямую через скрипт:
bash backend/build-wasm.sh
```

### 2. Запуск фронтенда

Требуется: Node.js 18+, npm.

```bash
cd frontend
npm install
npm run dev
```

Для сборки продакшн-бандла:
```bash
npm run build
```

### 3. Нативная сборка C++ (CLI тест)

Требуется: Clang 18+, CMake 3.28+, Ninja.

```bash
cmake -B backend/build -S backend -G Ninja
ninja -C backend/build
./backend/build/sim_test
```
