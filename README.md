# Cyclic Code Simulator

Симулятор циклических кодов (backend на C++20 с модулями, frontend на React/Vite/TypeScript).

## Структура проекта

- `backend/` — ядро симулятора на C++20 (CMake, Clang C++20 Modules)
- `frontend/` — веб-интерфейс на React + Vite + TypeScript

## Сборка и запуск

### Backend

Требуется: Clang 18+, CMake 3.28+, Ninja.

```bash
cmake -B backend/build -S backend -G Ninja
ninja -C backend/build
./backend/build/sim_test
```

### Frontend

Требуется: Node.js, npm.

```bash
cd frontend
npm install
npm run dev
```
