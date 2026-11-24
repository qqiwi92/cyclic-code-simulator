import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Square,
  RotateCcw,
  Download,
  Cpu,
  AlertTriangle,
  Terminal,
  Trash2,
  Copy,
  Check,
  Activity,
  Layers,
  Sliders,
  Info,
} from 'lucide-react';
import {
  runSimulation,
  exportToCsv,
  parsePolynomial,
  type SimulationParams,
  type SimulationResultRow,
} from '@/lib/simulator';

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'progress' | 'success' | 'warn' | 'error';
  message: string;
}

const PRESET_POLYNOMIALS = [
  { label: '[5; 3; 0] (n=15, k=10)', poly: '[5; 3; 0]', n: 15 },
  { label: '[4; 1; 0] (n=7, k=3)', poly: '[4; 1; 0]', n: 7 },
  { label: '[3; 1; 0] (n=7, k=4)', poly: '[3; 1; 0]', n: 7 },
  { label: '[6; 5; 4; 2; 1; 0] (n=15, k=9)', poly: '[6; 5; 4; 2; 1; 0]', n: 15 },
  { label: '[8; 7; 6; 4; 2; 1; 0] (n=31, k=23)', poly: '[8; 7; 6; 4; 2; 1; 0]', n: 31 },
];

const INDEPENDENT_PRESETS = [
  { label: 'p = 0.001 (10⁻³)', value: 0.001 },
  { label: 'p = 0.01 (1%)', value: 0.01 },
  { label: 'p = 0.05 (5%)', value: 0.05 },
  { label: 'p = 0.1 (10%)', value: 0.1 },
];

const GILBERT_PRESETS = [
  {
    label: 'Слабые пакеты',
    gb: 0.001,
    bg: 0.1,
    pBad: 0.25,
    pGood: 0.00001,
  },
  {
    label: 'Стандартные всплески',
    gb: 0.005,
    bg: 0.05,
    pBad: 0.5,
    pGood: 0.0001,
  },
  {
    label: 'Сильные помехи',
    gb: 0.02,
    bg: 0.02,
    pBad: 0.6,
    pGood: 0.001,
  },
];

export const CrcLabModForm = () => {
  // 1. Code parameters
  const [blockSize, setBlockSize] = useState<number>(15);
  const [polyInput, setPolyInput] = useState<string>('[5; 3; 0]');

  // 2. Stop condition parameters
  const [blockLimit, setBlockLimit] = useState<number>(1000000);
  const [errorLimit, setErrorLimit] = useState<number>(100);

  // 3. Channel model parameters
  // modelType: 0 = Independent, 1 = Gilbert-Elliott
  const [modelType, setModelType] = useState<number>(0);
  const [bitErrorProb, setBitErrorProb] = useState<number>(0.01);
  const [gilbertGood2Bad, setGilbertGood2Bad] = useState<number>(0.001);
  const [gilbertBad2Good, setGilbertBad2Good] = useState<number>(0.05);
  const [gilbertDuringBad, setGilbertDuringBad] = useState<number>(0.5);
  const [gilbertDuringGood, setGilbertDuringGood] = useState<number>(0.0001);

  // 4. Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedLog, setCopiedLog] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // 5. Results table state
  const [results, setResults] = useState<SimulationResultRow[]>([
    {
      id: 'initial-1',
      index: 1,
      blockSize: 15,
      infoSize: 10,
      channelModel: 'Независимые (p=0.01)',
      polyString: '[5; 3; 0]',
      correctBlocks: 860145,
      detectedErrors: 139845,
      undetectedErrors: 10,
      totalBlocks: 1000000,
      stoppedReason: 'limit_blocks',
      timestamp: 'Исходный результат',
    },
  ]);

  // 6. Live log entries
  const [logs, setLogs] = useState<LogEntry[]>(() => [
    {
      id: 'log-0',
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      message: 'Система инициализирована. Загружено WebAssembly C++20 ядро моделирования.',
    },
  ]);

  const addLog = (type: LogEntry['type'], message: string) => {
    const newEntry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setLogs((prev) => [...prev, newEntry]);
  };

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Polynomial parsing and validation
  const parsed = parsePolynomial(polyInput);
  const k = blockSize - parsed.degree;
  const isDegreeValid = parsed.degree > 0 && k > 0;
  const isPolyValid = parsed.isValid && isDegreeValid;

  // Average Gilbert channel stats for display
  const gilbertTotalTrans = gilbertGood2Bad + gilbertBad2Good;
  const gilbertBadStateProb =
    gilbertTotalTrans > 0 ? gilbertGood2Bad / gilbertTotalTrans : 0;
  const gilbertAvgBitError =
    (1 - gilbertBadStateProb) * gilbertDuringGood +
    gilbertBadStateProb * gilbertDuringBad;
  const gilbertAvgBurstLength =
    gilbertBad2Good > 0 ? (1 / gilbertBad2Good).toFixed(1) : '∞';

  const handleRun = async () => {
    if (isRunning) return;

    if (!isPolyValid) {
      const err =
        parsed.errorMessage ||
        `Степень образующего полинома (r=${parsed.degree}) должна быть строго меньше размера блока (n=${blockSize})`;
      setErrorMessage(err);
      addLog('error', `Ошибка валидации: ${err}`);
      return;
    }

    setErrorMessage(null);
    setIsRunning(true);
    setProgressText('Инициализация C++ WebAssembly ядра...');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const channelDesc =
      modelType === 0
        ? `Независимые ошибки (p=${bitErrorProb})`
        : `Гильберт (P_gb=${gilbertGood2Bad}, P_bg=${gilbertBad2Good}, P_err|B=${gilbertDuringBad}, P_err|G=${gilbertDuringGood})`;

    addLog(
      'info',
      `Запуск моделирования: код (${blockSize}, ${k}), полином ${parsed.formatted} (r=${parsed.degree}), ${channelDesc}, лимит блоков: ${blockLimit.toLocaleString()}, лимит необнаруженных ошибок: ${errorLimit.toLocaleString()}`
    );

    const startTime = performance.now();

    const params: SimulationParams = {
      blockSize: Number(blockSize) || 15,
      polyInput,
      blockLimit: Number(blockLimit) || 1000000,
      errorLimit: Number(errorLimit) || 100,
      modelType,
      bitErrorProb: Number(bitErrorProb) || 0.01,
      gilbertGood2Bad: Number(gilbertGood2Bad) || 0.001,
      gilbertBad2Good: Number(gilbertBad2Good) || 0.05,
      gilbertDuringBad: Number(gilbertDuringBad) || 0.5,
      gilbertDuringGood: Number(gilbertDuringGood) || 0,
    };

    let lastLoggedBlocks = 0;

    try {
      const res = await runSimulation(
        params,
        (prog) => {
          setProgressText(
            `Блоков: ${prog.currentBlocks.toLocaleString()} | Обнаружено: ${prog.detectedErrors.toLocaleString()} | Не обнаружено: ${prog.undetectedErrors.toLocaleString()}`
          );
          // Log periodic progress every 250,000 blocks
          if (prog.currentBlocks - lastLoggedBlocks >= 250000) {
            lastLoggedBlocks = prog.currentBlocks;
            addLog(
              'progress',
              `Прогресс: ${prog.currentBlocks.toLocaleString()} блоков | Обнаружено: ${prog.detectedErrors.toLocaleString()} | Не обнаружено: ${prog.undetectedErrors.toLocaleString()}`
            );
          }
        },
        abortController.signal
      );

      const elapsedMs = performance.now() - startTime;
      const elapsedSec = (elapsedMs / 1000).toFixed(2);

      const newRow: SimulationResultRow = {
        id: `sim-${Date.now()}`,
        index: results.length + 1,
        ...res,
        timestamp: new Date().toLocaleTimeString(),
      };

      setResults((prev) => [...prev, newRow]);

      const stopLabel =
        res.stoppedReason === 'limit_blocks'
          ? 'по лимиту блоков'
          : res.stoppedReason === 'limit_errors'
            ? 'по лимиту ошибок'
            : 'вручную';

      addLog(
        'success',
        `Завершено за ${elapsedSec}с: Всего ${res.totalBlocks.toLocaleString()} блоков (Верно: ${res.correctBlocks.toLocaleString()}, Обнаружено: ${res.detectedErrors.toLocaleString()}, Не обнаружено: ${res.undetectedErrors.toLocaleString()}). Останов: ${stopLabel}.`
      );
    } catch (err: any) {
      console.error('Simulation error', err);
      const msg = err?.message || 'Ошибка выполнения моделирования';
      setErrorMessage(msg);
      addLog('error', `Сбой моделирования: ${msg}`);
    } finally {
      setIsRunning(false);
      setProgressText('');
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      addLog('warn', 'Моделирование остановлено пользователем.');
    }
  };

  const handleClearResults = () => {
    setResults([]);
    addLog('info', 'Таблица результатов очищена.');
  };

  const handleRestoreInitial = () => {
    setBlockSize(15);
    setBitErrorProb(0.01);
    setBlockLimit(1000000);
    setErrorLimit(100);
    setPolyInput('[5; 3; 0]');
    setModelType(0);
    setResults([
      {
        id: 'initial-1',
        index: 1,
        blockSize: 15,
        infoSize: 10,
        channelModel: 'Независимые (p=0.01)',
        polyString: '[5; 3; 0]',
        correctBlocks: 860145,
        detectedErrors: 139845,
        undetectedErrors: 10,
        totalBlocks: 1000000,
        stoppedReason: 'limit_blocks',
        timestamp: 'Исходный результат',
      },
    ]);
    addLog('info', 'Восстановлены параметры и исходный пример из методических указаний.');
  };

  const handleExportCsv = () => {
    if (results.length === 0) return;
    exportToCsv(results);
    addLog('info', `Экспортировано ${results.length} строк в CSV файл.`);
  };

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-2 sm:p-4 md:p-6 space-y-6 transition-all font-sans">
      {/* Main Container Card */}
      <div className="rounded-xl border border-border/80 bg-card text-card-foreground shadow-2xl overflow-hidden transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/60 border-b border-border select-none">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-red-600 via-orange-500 to-amber-500 flex items-center justify-center text-white text-[11px] font-bold shadow-sm">
              ▲
            </div>
            <span className="text-sm font-semibold tracking-wide text-foreground font-mono">
              crclabmod
            </span>
            <Badge variant="outline" className="text-[11px] font-mono px-1.5 py-0 flex items-center gap-1">
              <Cpu className="w-3 h-3 text-emerald-500" />
              <span>C++20 WASM GF(2)</span>
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline mr-2">
              Моделирование циклических кодов
            </span>
            <div className="flex items-center gap-1.5 text-muted-foreground/70">
              <span className="inline-block w-3 h-0.5 bg-muted-foreground/50 rounded cursor-default" />
              <span className="inline-block w-2.5 h-2.5 border border-muted-foreground/50 rounded-sm cursor-default" />
              <span className="inline-block text-[13px] leading-none text-muted-foreground/50 cursor-default px-0.5">
                ✕
              </span>
            </div>
          </div>
        </div>

        {/* Form Body - Grouped Cards */}
        <div className="p-4 sm:p-6 space-y-6 bg-background/50">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* GROUP 1: Code Parameters */}
            <Card className="border border-border/70 shadow-sm bg-card/70 flex flex-col justify-between">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">
                    1. Параметры кода (n, k)
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Длина кодового слова и образующий полином
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="block-size" className="text-xs font-medium">
                      Размер блока (n)
                    </Label>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      k = {k > 0 ? k : '—'}, r = {parsed.degree}
                    </span>
                  </div>
                  <Input
                    id="block-size"
                    type="number"
                    min={3}
                    max={64}
                    value={blockSize}
                    onChange={(e) => setBlockSize(parseInt(e.target.value, 10) || 0)}
                    className="font-mono text-sm bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="poly-input" className="text-xs font-medium">
                    Образующий полином g(x)
                  </Label>
                  <Input
                    id="poly-input"
                    type="text"
                    value={polyInput}
                    onChange={(e) => setPolyInput(e.target.value)}
                    placeholder="[5; 3; 0]"
                    className={`font-mono text-sm bg-background ${
                      !isPolyValid ? 'border-destructive focus-visible:ring-destructive' : ''
                    }`}
                  />
                  <div className="text-[11px] font-mono text-muted-foreground pt-0.5 truncate">
                    Формула: {parsed.formula}
                  </div>
                </div>

                <div className="pt-1 space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground block">
                    Популярные коды:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {PRESET_POLYNOMIALS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setPolyInput(preset.poly);
                          setBlockSize(preset.n);
                        }}
                        className="px-2 py-0.5 rounded border border-border/60 hover:border-primary/50 hover:bg-muted/60 transition-colors font-mono text-[10px]"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* GROUP 2: Channel Model */}
            <Card className="border border-border/70 shadow-sm bg-card/70 flex flex-col justify-between">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">
                    2. Модель канала связи
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Характер и вероятности возникновения ошибок
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {/* Model toggle pills */}
                <div className="grid grid-cols-2 p-0.5 rounded-lg bg-muted border border-border text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setModelType(0)}
                    className={`py-1.5 rounded-md transition-all text-center ${
                      modelType === 0
                        ? 'bg-background text-foreground shadow-sm font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Независимые
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelType(1)}
                    className={`py-1.5 rounded-md transition-all text-center ${
                      modelType === 1
                        ? 'bg-background text-foreground shadow-sm font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Гильберт-Эллиотт
                  </button>
                </div>

                {modelType === 0 ? (
                  /* Independent BSC inputs */
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                      <Label htmlFor="bit-error-prob" className="text-xs font-medium">
                        Вероятность ошибки на бит (p)
                      </Label>
                      <Input
                        id="bit-error-prob"
                        type="number"
                        step="0.001"
                        min="0"
                        max="1"
                        value={bitErrorProb}
                        onChange={(e) => setBitErrorProb(parseFloat(e.target.value) || 0)}
                        className="font-mono text-sm bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground block">
                        Пресеты вероятности:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {INDEPENDENT_PRESETS.map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => setBitErrorProb(p.value)}
                            className="px-2 py-0.5 rounded border border-border/60 hover:border-primary/50 hover:bg-muted/60 transition-colors font-mono text-[10px]"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Gilbert-Elliott inputs */
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="gilbert-gb" className="text-[11px] font-medium">
                          P(G → B) переход
                        </Label>
                        <Input
                          id="gilbert-gb"
                          type="number"
                          step="0.001"
                          min="0"
                          max="1"
                          value={gilbertGood2Bad}
                          onChange={(e) => setGilbertGood2Bad(parseFloat(e.target.value) || 0)}
                          className="font-mono text-xs bg-background h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="gilbert-bg" className="text-[11px] font-medium">
                          P(B → G) возврат
                        </Label>
                        <Input
                          id="gilbert-bg"
                          type="number"
                          step="0.001"
                          min="0"
                          max="1"
                          value={gilbertBad2Good}
                          onChange={(e) => setGilbertBad2Good(parseFloat(e.target.value) || 0)}
                          className="font-mono text-xs bg-background h-8"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="gilbert-p-bad" className="text-[11px] font-medium">
                          P(e | Bad)
                        </Label>
                        <Input
                          id="gilbert-p-bad"
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={gilbertDuringBad}
                          onChange={(e) => setGilbertDuringBad(parseFloat(e.target.value) || 0)}
                          className="font-mono text-xs bg-background h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="gilbert-p-good" className="text-[11px] font-medium">
                          P(e | Good)
                        </Label>
                        <Input
                          id="gilbert-p-good"
                          type="number"
                          step="0.0001"
                          min="0"
                          max="1"
                          value={gilbertDuringGood}
                          onChange={(e) => setGilbertDuringGood(parseFloat(e.target.value) || 0)}
                          className="font-mono text-xs bg-background h-8"
                        />
                      </div>
                    </div>

                    <div className="text-[10px] text-muted-foreground font-mono bg-muted/40 p-1.5 rounded border border-border/50 space-y-0.5">
                      <div>Ср. длина пакета: ~{gilbertAvgBurstLength} бит</div>
                      <div>Ср. p ошибки: {(gilbertAvgBitError * 100).toFixed(3)}%</div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {GILBERT_PRESETS.map((gp) => (
                        <button
                          key={gp.label}
                          type="button"
                          onClick={() => {
                            setGilbertGood2Bad(gp.gb);
                            setGilbertBad2Good(gp.bg);
                            setGilbertDuringBad(gp.pBad);
                            setGilbertDuringGood(gp.pGood);
                          }}
                          className="px-1.5 py-0.5 rounded border border-border/60 hover:border-primary/50 hover:bg-muted/60 transition-colors font-mono text-[9px]"
                        >
                          {gp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* GROUP 3: Stop Conditions & Run */}
            <Card className="border border-border/70 shadow-sm bg-card/70 flex flex-col justify-between">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">
                    3. Условия остановки
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Критерии завершения цикла моделирования
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="block-limit" className="text-xs font-medium">
                      Блоков до остановки
                    </Label>
                    <span className="text-[10px] text-muted-foreground">0 = без лимита</span>
                  </div>
                  <Input
                    id="block-limit"
                    type="number"
                    step="10000"
                    min="0"
                    value={blockLimit}
                    onChange={(e) => setBlockLimit(parseInt(e.target.value, 10) || 0)}
                    className="font-mono text-sm bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="error-limit" className="text-xs font-medium">
                      Необнаруженных ошибок до остановки
                    </Label>
                    <span className="text-[10px] text-muted-foreground">0 = без лимита</span>
                  </div>
                  <Input
                    id="error-limit"
                    type="number"
                    min="0"
                    value={errorLimit}
                    onChange={(e) => setErrorLimit(parseInt(e.target.value, 10) || 0)}
                    className="font-mono text-sm bg-background"
                  />
                </div>

                {/* Validation message if any */}
                {(!isPolyValid || errorMessage) && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive font-medium p-2 rounded bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="text-[11px] leading-tight">
                      {errorMessage ||
                        parsed.errorMessage ||
                        `Степень полинома r=${parsed.degree} должна быть меньше длины блока n=${blockSize}`}
                    </span>
                  </div>
                )}

                {/* Main Action Buttons */}
                <div className="pt-2 flex flex-col gap-2">
                  {isRunning ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleStop}
                      className="w-full font-medium shadow-sm flex items-center justify-center gap-2"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      Остановить моделирование
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleRun}
                      disabled={!isPolyValid}
                      className="w-full font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Запустить моделирование
                    </Button>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClearResults}
                      disabled={isRunning || results.length === 0}
                      className="text-xs font-medium"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1 opacity-70" />
                      Очистить
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleExportCsv}
                      disabled={results.length === 0}
                      className="text-xs font-medium"
                    >
                      <Download className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                      Экспорт CSV
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Running progress bar text */}
          {isRunning && (
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 flex items-center justify-between text-xs font-mono text-primary animate-pulse">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block animate-ping" />
                <span>{progressText || 'Моделирование в C++ WebAssembly...'}</span>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary">
                WASM Core Running
              </Badge>
            </div>
          )}

          {/* Results Table Section */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wide flex items-center gap-2">
                <span>Журнал экспериментов</span>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {results.length} записей
                </Badge>
              </h3>
              {results.length === 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRestoreInitial}
                  className="text-xs text-primary underline h-auto p-0"
                >
                  Восстановить пример из методички
                </Button>
              )}
            </div>

            <div className="border border-border rounded-lg overflow-hidden bg-card shadow-sm">
              <div className="overflow-x-auto">
                <Table className="w-full text-xs">
                  <TableHeader className="bg-muted/50 border-b border-border">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 text-center font-semibold text-muted-foreground py-2 px-1 border-r border-border">
                        #
                      </TableHead>
                      <TableHead className="text-center font-semibold text-muted-foreground py-2 px-3 border-r border-border whitespace-nowrap">
                        Код (n, k)
                      </TableHead>
                      <TableHead className="text-center font-semibold text-muted-foreground py-2 px-3 border-r border-border whitespace-nowrap">
                        Канал
                      </TableHead>
                      <TableHead className="text-center font-semibold text-muted-foreground py-2 px-3 border-r border-border whitespace-nowrap">
                        Полином g(x)
                      </TableHead>
                      <TableHead className="text-center font-semibold text-muted-foreground py-2 px-3 border-r border-border whitespace-nowrap">
                        Верно принятые
                      </TableHead>
                      <TableHead className="text-center font-semibold text-muted-foreground py-2 px-3 border-r border-border whitespace-nowrap">
                        Обнаружено ошибок
                      </TableHead>
                      <TableHead className="text-center font-semibold text-muted-foreground py-2 px-3 border-r border-border whitespace-nowrap">
                        Не обнаружено
                      </TableHead>
                      <TableHead className="text-center font-semibold text-muted-foreground py-2 px-3 border-r border-border whitespace-nowrap">
                        Всего блоков
                      </TableHead>
                      <TableHead className="text-center font-semibold text-muted-foreground py-2 px-2 whitespace-nowrap">
                        Останов
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="h-24 text-center text-muted-foreground"
                        >
                          Нет данных. Запустите моделирование выше.
                        </TableCell>
                      </TableRow>
                    ) : (
                      results.map((row) => (
                        <TableRow
                          key={row.id}
                          className="hover:bg-muted/40 transition-colors font-mono text-center divide-x divide-border"
                        >
                          <TableCell className="py-2 px-1 text-muted-foreground font-semibold">
                            {row.index}
                          </TableCell>
                          <TableCell className="py-2 px-3 font-medium">
                            ({row.blockSize}, {row.infoSize})
                          </TableCell>
                          <TableCell className="py-2 px-3 text-[11px] text-muted-foreground">
                            {row.channelModel}
                          </TableCell>
                          <TableCell className="py-2 px-3 font-semibold text-primary">
                            {row.polyString}
                          </TableCell>
                          <TableCell className="py-2 px-3 font-medium text-emerald-600 dark:text-emerald-400">
                            {row.correctBlocks.toLocaleString()}
                          </TableCell>
                          <TableCell className="py-2 px-3 font-medium text-amber-600 dark:text-amber-400">
                            {row.detectedErrors.toLocaleString()}
                          </TableCell>
                          <TableCell className="py-2 px-3 font-medium text-rose-600 dark:text-rose-400">
                            {row.undetectedErrors.toLocaleString()}
                          </TableCell>
                          <TableCell className="py-2 px-3 font-medium">
                            {row.totalBlocks.toLocaleString()}
                          </TableCell>
                          <TableCell className="py-2 px-2">
                            <Badge
                              variant="secondary"
                              className={`text-[9px] px-1 py-0 ${
                                row.stoppedReason === 'limit_errors'
                                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                  : row.stoppedReason === 'limit_blocks'
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {row.stoppedReason === 'limit_errors'
                                ? 'По ошибкам'
                                : row.stoppedReason === 'limit_blocks'
                                  ? 'По блокам'
                                  : 'Вручную'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* LIVE TERMINAL / EVENT LOG SECTION AT THE BOTTOM */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold tracking-wide">
                  Консоль событий и лог моделирования
                </h3>
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 text-emerald-500 border-emerald-500/30">
                  {isRunning ? 'Активно' : 'Ожидание'}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyLogs}
                  disabled={logs.length === 0}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  title="Скопировать лог в буфер обмена"
                >
                  {copiedLog ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                      <span>Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1" />
                      <span>Копировать</span>
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearLogs}
                  disabled={logs.length === 0}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  title="Очистить лог"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  <span>Очистить</span>
                </Button>
              </div>
            </div>

            <div
              ref={logContainerRef}
              className="w-full h-44 rounded-lg border border-border bg-black/90 p-3 font-mono text-[11px] overflow-y-auto space-y-1 shadow-inner select-text"
            >
              {logs.length === 0 ? (
                <div className="text-zinc-500 italic">Лог пуст.</div>
              ) : (
                logs.map((log) => {
                  let badgeColor = 'text-zinc-400';
                  let prefix = 'LOG';
                  if (log.type === 'info') {
                    badgeColor = 'text-sky-400';
                    prefix = 'INF';
                  } else if (log.type === 'progress') {
                    badgeColor = 'text-amber-400';
                    prefix = 'PRG';
                  } else if (log.type === 'success') {
                    badgeColor = 'text-emerald-400 font-semibold';
                    prefix = 'OK ';
                  } else if (log.type === 'warn') {
                    badgeColor = 'text-yellow-400';
                    prefix = 'WRN';
                  } else if (log.type === 'error') {
                    badgeColor = 'text-rose-400 font-semibold';
                    prefix = 'ERR';
                  }

                  return (
                    <div key={log.id} className="leading-relaxed flex items-start gap-2">
                      <span className="text-zinc-500 shrink-0 select-none">
                        [{log.timestamp}]
                      </span>
                      <span className={`${badgeColor} shrink-0 select-none`}>
                        [{prefix}]
                      </span>
                      <span className="text-zinc-300 break-all">{log.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2 bg-muted/30 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full inline-block ${
                isPolyValid ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
            <span>
              Текущий код ({blockSize}, {Math.max(0, k)}): n={blockSize}, k=
              {Math.max(0, k)}, r={parsed.degree}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Info className="w-3 h-3 text-muted-foreground" />
              <span>Формула: {parsed.formula}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CrcLabModForm;
