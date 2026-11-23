# Cyclic Code Simulator

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
