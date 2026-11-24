import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  AlertTriangle,
  Terminal,
  Trash2,
  Copy,
  Check,
  Activity,
  Layers,
  Sliders,
  Cpu,
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
  { label: '[5; 3; 0] (15, 10)', poly: '[5; 3; 0]', n: 15 },
  { label: '[4; 1; 0] (7, 3)', poly: '[4; 1; 0]', n: 7 },
  { label: '[3; 1; 0] (7, 4)', poly: '[3; 1; 0]', n: 7 },
  { label: '[6; 5; 4; 2; 1; 0] (15, 9)', poly: '[6; 5; 4; 2; 1; 0]', n: 15 },
  { label: '[8; 7; 6; 4; 2; 1; 0] (31, 23)', poly: '[8; 7; 6; 4; 2; 1; 0]', n: 31 },
];

const INDEPENDENT_PRESETS = [
  { label: 'p = 0.001', value: 0.001 },
  { label: 'p = 0.01', value: 0.01 },
  { label: 'p = 0.05', value: 0.05 },
  { label: 'p = 0.1', value: 0.1 },
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
      message: 'Инициализирован Web Worker поток для C++ WebAssembly ядра моделирования.',
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
        `Степень полинома (r=${parsed.degree}) должна быть строго меньше размера блока (n=${blockSize})`;
      setErrorMessage(err);
      addLog('error', `Ошибка: ${err}`);
      return;
    }

    setErrorMessage(null);
    setIsRunning(true);
    setProgressText('Запуск в фоновом Web Worker потоке...');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const channelDesc =
      modelType === 0
        ? `Независимые (p=${bitErrorProb})`
        : `Гильберт (P_gb=${gilbertGood2Bad}, P_bg=${gilbertBad2Good})`;

    addLog(
      'info',
      `Старт: (${blockSize}, ${k}), g(x)=${parsed.formatted}, ${channelDesc}, лимит блоков: ${blockLimit.toLocaleString()}, лимит ошибок: ${errorLimit.toLocaleString()}`
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
          if (prog.currentBlocks - lastLoggedBlocks >= 250000) {
            lastLoggedBlocks = prog.currentBlocks;
            addLog(
              'progress',
              `Обработано: ${prog.currentBlocks.toLocaleString()} блоков | Обнаружено: ${prog.detectedErrors.toLocaleString()} | Не обнаружено: ${prog.undetectedErrors.toLocaleString()}`
            );
          }
        },
        abortController.signal
      );

      const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(2);

      const newRow: SimulationResultRow = {
        id: `sim-${Date.now()}`,
        index: results.length + 1,
        ...res,
        timestamp: new Date().toLocaleTimeString(),
      };

      setResults((prev) => [newRow,...prev]);

      const stopLabel =
        res.stoppedReason === 'limit_blocks'
          ? 'по лимиту блоков'
          : res.stoppedReason === 'limit_errors'
            ? 'по лимиту ошибок'
            : 'вручную';

      addLog(
        'success',
        `Успешно за ${elapsedSec}с: Всего ${res.totalBlocks.toLocaleString()} блоков (Верно: ${res.correctBlocks.toLocaleString()}, Обнаружено: ${res.detectedErrors.toLocaleString()}, Не обнаружено: ${res.undetectedErrors.toLocaleString()}). Останов: ${stopLabel}.`
      );
    } catch (err: any) {
      const msg = err?.message || 'Ошибка симуляции';
      if (msg.includes('Отменено')) {
        addLog('warn', 'Моделирование прервано пользователем.');
      } else {
        setErrorMessage(msg);
        addLog('error', `Сбой: ${msg}`);
      }
    } finally {
      setIsRunning(false);
      setProgressText('');
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      addLog('warn', 'Запрос на остановку потока...');
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
    addLog('info', 'Восстановлен исходный контрольный пример.');
  };

  const handleExportCsv = () => {
    if (results.length === 0) return;
    exportToCsv(results);
    addLog('info', `Экспортировано ${results.length} строк в CSV.`);
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
    <div className="w-full h-full flex flex-col gap-2.5 overflow-hidden">
      {/* TOP ROW: 3 Grouped Cards across full screen width */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 shrink-0">
        {/* CARD 1: Code Parameters */}
        <Card className="border border-border/70 shadow-sm bg-card/80 p-3 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-primary" />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">
                  1. Код (n, k)
                </CardTitle>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">
                k = {k > 0 ? k : '—'}, r = {parsed.degree}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="block-size" className="text-[11px] font-medium text-muted-foreground">
                  Размер блока (n)
                </Label>
                <Input
                  id="block-size"
                  type="number"
                  min={3}
                  max={64}
                  value={blockSize}
                  onChange={(e) => setBlockSize(parseInt(e.target.value, 10) || 0)}
                  className="font-mono text-xs bg-background h-8"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="poly-input" className="text-[11px] font-medium text-muted-foreground">
                  Полином g(x)
                </Label>
                <Input
                  id="poly-input"
                  type="text"
                  value={polyInput}
                  onChange={(e) => setPolyInput(e.target.value)}
                  placeholder="[5; 3; 0]"
                  className={`font-mono text-xs bg-background h-8 ${
                    !isPolyValid ? 'border-destructive focus-visible:ring-destructive' : ''
                  }`}
                />
              </div>
            </div>

            <div className="text-[11px] font-mono text-muted-foreground truncate">
              Формула: <span className="text-foreground">{parsed.formula}</span>
            </div>

            <div className="flex flex-wrap gap-1 pt-0.5">
              {PRESET_POLYNOMIALS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setPolyInput(preset.poly);
                    setBlockSize(preset.n);
                  }}
                  className="px-1.5 py-0.5 rounded border border-border/60 hover:border-primary/50 hover:bg-muted/60 transition-colors font-mono text-[10px]"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* CARD 2: Channel Model */}
        <Card className="border border-border/70 shadow-sm bg-card/80 p-3 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-primary" />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">
                  2. Модель канала
                </CardTitle>
              </div>
              <div className="inline-flex rounded p-0.5 bg-muted text-[10px] font-medium">
                <button
                  type="button"
                  onClick={() => setModelType(0)}
                  className={`px-2 py-0.5 rounded transition-all ${
                    modelType === 0
                      ? 'bg-background text-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  БСК
                </button>
                <button
                  type="button"
                  onClick={() => setModelType(1)}
                  className={`px-2 py-0.5 rounded transition-all ${
                    modelType === 1
                      ? 'bg-background text-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Гильберт
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2 space-y-2">
            {modelType === 0 ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="bit-error-prob" className="text-[11px] font-medium text-muted-foreground">
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
                    className="font-mono text-xs bg-background h-8"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {INDEPENDENT_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setBitErrorProb(p.value)}
                      className="px-1.5 py-0.5 rounded border border-border/60 hover:border-primary/50 hover:bg-muted/60 transition-colors font-mono text-[10px]"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-4 gap-1.5">
                  <div className="space-y-0.5">
                    <Label htmlFor="gilbert-gb" className="text-[10px] text-muted-foreground truncate block">
                      P(G→B)
                    </Label>
                    <Input
                      id="gilbert-gb"
                      type="number"
                      step="0.001"
                      min="0"
                      max="1"
                      value={gilbertGood2Bad}
                      onChange={(e) => setGilbertGood2Bad(parseFloat(e.target.value) || 0)}
                      className="font-mono text-[11px] bg-background h-7 px-1.5 text-center"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label htmlFor="gilbert-bg" className="text-[10px] text-muted-foreground truncate block">
                      P(B→G)
                    </Label>
                    <Input
                      id="gilbert-bg"
                      type="number"
                      step="0.001"
                      min="0"
                      max="1"
                      value={gilbertBad2Good}
                      onChange={(e) => setGilbertBad2Good(parseFloat(e.target.value) || 0)}
                      className="font-mono text-[11px] bg-background h-7 px-1.5 text-center"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label htmlFor="gilbert-p-bad" className="text-[10px] text-muted-foreground truncate block">
                      P(e|B)
                    </Label>
                    <Input
                      id="gilbert-p-bad"
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={gilbertDuringBad}
                      onChange={(e) => setGilbertDuringBad(parseFloat(e.target.value) || 0)}
                      className="font-mono text-[11px] bg-background h-7 px-1.5 text-center"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label htmlFor="gilbert-p-good" className="text-[10px] text-muted-foreground truncate block">
                      P(e|G)
                    </Label>
                    <Input
                      id="gilbert-p-good"
                      type="number"
                      step="0.0001"
                      min="0"
                      max="1"
                      value={gilbertDuringGood}
                      onChange={(e) => setGilbertDuringGood(parseFloat(e.target.value) || 0)}
                      className="font-mono text-[11px] bg-background h-7 px-1.5 text-center"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground px-0.5">
                  <span>Ср. пакет: ~{gilbertAvgBurstLength} бит</span>
                  <span>p̄: {(gilbertAvgBitError * 100).toFixed(3)}%</span>
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

        {/* CARD 3: Stop Limits & Controls */}
        <Card className="border border-border/70 shadow-sm bg-card/80 p-3 flex flex-col justify-between">
          <CardHeader className="p-0 pb-2 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-primary" />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider">
                  3. Останов и запуск
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 flex items-center gap-1 text-emerald-500 border-emerald-500/30">
                <Cpu className="w-3 h-3" />
                <span>Worker Thread</span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="block-limit" className="text-[11px] font-medium text-muted-foreground">
                  Лимит блоков
                </Label>
                <Input
                  id="block-limit"
                  type="number"
                  step="10000"
                  min="0"
                  value={blockLimit}
                  onChange={(e) => setBlockLimit(parseInt(e.target.value, 10) || 0)}
                  className="font-mono text-xs bg-background h-8"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="error-limit" className="text-[11px] font-medium text-muted-foreground">
                  Лимит ошибок
                </Label>
                <Input
                  id="error-limit"
                  type="number"
                  min="0"
                  value={errorLimit}
                  onChange={(e) => setErrorLimit(parseInt(e.target.value, 10) || 0)}
                  className="font-mono text-xs bg-background h-8"
                />
              </div>
            </div>

            {(!isPolyValid || errorMessage) && (
              <div className="flex items-center gap-1 text-[11px] text-destructive leading-tight">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {errorMessage || parsed.errorMessage || `r=${parsed.degree} должна быть < n=${blockSize}`}
                </span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              {isRunning ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleStop}
                  className="col-span-1 h-8 text-xs font-medium"
                >
                  <Square className="w-3.5 h-3.5 mr-1 fill-current" />
                  Стоп
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleRun}
                  disabled={!isPolyValid}
                  className="col-span-1 h-8 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                  Старт
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={handleClearResults}
                disabled={isRunning || results.length === 0}
                className="h-8 text-xs font-medium"
              >
                <RotateCcw className="w-3 h-3 mr-1 opacity-70" />
                Сброс
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleExportCsv}
                disabled={results.length === 0}
                className="h-8 text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1 text-muted-foreground" />
                CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RUNNING BANNER (when simulation is actively running) */}
      {isRunning && (
        <div className="px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 flex items-center justify-between text-xs font-mono text-primary shrink-0 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary inline-block animate-ping" />
            <span>{progressText || 'Моделирование в фоновом потоке...'}</span>
          </div>
          <span className="text-[11px] text-primary/80">Поток активен</span>
        </div>
      )}

      {/* MIDDLE: Results Table across 100% full width (flex-1, no page scroll) */}
      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border bg-card overflow-hidden shadow-sm">
        <div className="px-3 py-2 bg-muted/40 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Результаты экспериментов</span>
            <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
              {results.length} записей
            </Badge>
          </div>
          {results.length === 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRestoreInitial}
              className="text-xs text-primary underline h-auto p-0"
            >
              Восстановить исходный пример
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <Table className="w-full text-xs">
            <TableHeader className="bg-muted/60 sticky top-0 z-10 border-b border-border">
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
                    className="h-28 text-center text-muted-foreground"
                  >
                    Нет данных. Запустите моделирование в панели выше.
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

      {/* BOTTOM: Event Log Terminal across full width (compact, internal scroll only) */}
      <div className="h-32 sm:h-36 shrink-0 flex flex-col rounded-lg border border-border bg-black/95 overflow-hidden shadow-inner">
        <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold tracking-wide text-zinc-300 font-mono">Консоль событий</span>
            <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 text-emerald-400 border-emerald-400/30">
              {isRunning ? 'Поток активен' : 'Готов'}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopyLogs}
              disabled={logs.length === 0}
              className="h-6 px-1.5 text-[11px] text-zinc-400 hover:text-zinc-100"
              title="Скопировать"
            >
              {copiedLog ? (
                <>
                  <Check className="w-3 h-3 mr-1 text-emerald-400" />
                  <span>Скопировано</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1" />
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
              className="h-6 px-1.5 text-[11px] text-zinc-400 hover:text-rose-400"
              title="Очистить"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              <span>Очистить</span>
            </Button>
          </div>
        </div>

        <div
          ref={logContainerRef}
          className="flex-1 min-h-0 overflow-y-auto p-2 font-mono text-[11px] space-y-0.5 select-text"
        >
          {logs.length === 0 ? (
            <div className="text-zinc-600 italic">Лог пуст.</div>
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
                <div key={log.id} className="leading-tight flex items-start gap-1.5">
                  <span className="text-zinc-600 shrink-0 select-none">
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
  );
};

export default CrcLabModForm;
