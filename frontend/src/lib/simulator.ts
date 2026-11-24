export interface SimulationParams {
  blockSize: number;
  polyInput: string;
  blockLimit: number;
  errorLimit: number;
  modelType: number; // 0 = independent, 1 = Gilbert
  bitErrorProb?: number;
  gilbertGood2Bad?: number;
  gilbertBad2Good?: number;
  gilbertDuringBad?: number;
  gilbertDuringGood?: number;
}

export interface SimulationResultRow {
  id: string;
  index: number;
  blockSize: number;
  infoSize: number;
  channelModel: string;
  polyString: string;
  correctBlocks: number;
  detectedErrors: number;
  undetectedErrors: number;
  totalBlocks: number;
  stoppedReason?: 'limit_blocks' | 'limit_errors' | 'manual';
  timestamp: string;
}

export interface ParsedPoly {
  powers: number[];
  degree: number;
  mask: bigint;
  formatted: string;
  formula: string;
  isValid: boolean;
  errorMessage?: string;
}

export function parsePolynomial(input: string): ParsedPoly {
  const trimmed = input.trim();

  // Binary representation: e.g. "101001"
  if (/^[01]+$/.test(trimmed)) {
    const powers: number[] = [];
    const len = trimmed.length;
    let mask = 0n;
    for (let i = 0; i < len; i++) {
      if (trimmed[i] === '1') {
        const power = len - 1 - i;
        powers.push(power);
        mask |= 1n << BigInt(power);
      }
    }
    const degree = powers[0] ?? 0;
    const hasConst = (mask & 1n) === 1n;
    return {
      powers,
      degree,
      mask,
      formatted: `[${powers.join('; ')}]`,
      formula: formatFormula(powers),
      isValid: hasConst && powers.length > 0,
      errorMessage: !hasConst
        ? 'Свободный член x⁰ (младший бит) должен быть равен 1'
        : undefined,
    };
  }

  // Degree list representation: e.g. "[5; 3; 0]" or "5 3 0" or "x^5 + x^3 + 1"
  const cleaned = trimmed.replace(/^\[/, '').replace(/\]$/, '');
  const tokens = cleaned.split(/[\s;,+]+/).filter(Boolean);
  const powers = tokens
    .map((t) => {
      if (t.startsWith('x^')) return parseInt(t.slice(2), 10);
      if (t === 'x') return 1;
      if (t === '1') return 0;
      return parseInt(t, 10);
    })
    .filter((n) => !isNaN(n) && n >= 0)
    .sort((a, b) => b - a);

  // Eliminate duplicates
  const uniquePowers = Array.from(new Set(powers)).sort((a, b) => b - a);

  if (uniquePowers.length === 0) {
    return {
      powers: [5, 3, 0],
      degree: 5,
      mask: 0b101001n,
      formatted: '[5; 3; 0]',
      formula: 'x⁵ + x³ + 1',
      isValid: true,
    };
  }

  let mask = 0n;
  for (const p of uniquePowers) {
    mask |= 1n << BigInt(p);
  }
  const degree = uniquePowers[0];
  const hasConst = (mask & 1n) === 1n;

  return {
    powers: uniquePowers,
    degree,
    mask,
    formatted: `[${uniquePowers.join('; ')}]`,
    formula: formatFormula(uniquePowers),
    isValid: hasConst,
    errorMessage: !hasConst
      ? 'Полином циклического кода должен содержать свободный член x⁰ (0)'
      : undefined,
  };
}

function formatFormula(powers: number[]): string {
  if (powers.length === 0) return '0';
  const superDigits = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  const toSuper = (num: number) =>
    num
      .toString()
      .split('')
      .map((d) => superDigits[parseInt(d, 10)] ?? d)
      .join('');

  return powers
    .map((p) => {
      if (p === 0) return '1';
      if (p === 1) return 'x';
      return `x${toSuper(p)}`;
    })
    .join(' + ');
}

export async function runSimulation(
  params: SimulationParams,
  onProgress?: (progress: {
    currentBlocks: number;
    detectedErrors: number;
    undetectedErrors: number;
  }) => void,
  signal?: AbortSignal
): Promise<Omit<SimulationResultRow, 'id' | 'index' | 'timestamp'>> {
  const {
    blockSize: n,
    polyInput,
    blockLimit,
    errorLimit,
    modelType = 0,
    bitErrorProb = 0.01,
    gilbertGood2Bad = 0.001,
    gilbertBad2Good = 0.05,
    gilbertDuringBad = 0.5,
    gilbertDuringGood = 0.0,
  } = params;

  const parsedPoly = parsePolynomial(polyInput);
  const degree = parsedPoly.degree;
  const k = n - degree;

  if (degree <= 0 || k <= 0) {
    throw new Error(
      `Степень полинома r=${degree} должна быть меньше длины блока n=${n} (k=${k} должно быть > 0)`
    );
  }

  if ((parsedPoly.mask & 1n) === 0n) {
    throw new Error('Образующий полином должен содержать свободный член 1 (x⁰)');
  }

  // Launch in dedicated Web Worker thread
  const worker = new Worker(
    new URL('../workers/simulator.worker.ts', import.meta.url),
    { type: 'module' }
  );

  const reqId = `sim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const cfg = {
    n,
    k,
    poly: parsedPoly.mask,
    model_type: modelType,
    independant_prob: Math.max(0, Math.min(1, bitErrorProb)),
    gilbert_good2bad_prob: Math.max(0, Math.min(1, gilbertGood2Bad)),
    gilbert_bad2good_prob: Math.max(0, Math.min(1, gilbertBad2Good)),
    gilbert_during_bad_prob: Math.max(0, Math.min(1, gilbertDuringBad)),
    gilbert_during_good_prob: Math.max(0, Math.min(1, gilbertDuringGood)),
    target_errors: BigInt(Math.max(0, errorLimit)),
    block_limit: BigInt(Math.max(0, blockLimit)),
  };

  const channelModelDesc =
    modelType === 0
      ? `Независимые (p=${bitErrorProb})`
      : `Гильберт (P_gb=${gilbertGood2Bad}, P_bg=${gilbertBad2Good})`;

  return new Promise((resolve, reject) => {
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        try {
          worker.terminate();
        } catch {}
      }
    };

    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(new Error('Отменено пользователем'));
        return;
      }
      signal.addEventListener('abort', () => {
        try {
          worker.postMessage({ type: 'cancel', id: reqId });
        } catch {}
        setTimeout(cleanup, 60);
      });
    }

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || msg.id !== reqId) return;

      if (msg.type === 'progress') {
        onProgress?.(msg.data);
      } else if (msg.type === 'done') {
        const { totalBlocks, detectedErrors, undetectedErrors, stoppedReason } = msg.data;
        cleanup();
        const correctBlocks = Math.max(0, totalBlocks - detectedErrors - undetectedErrors);
        resolve({
          blockSize: n,
          infoSize: k,
          channelModel: channelModelDesc,
          polyString: parsedPoly.formatted,
          correctBlocks,
          detectedErrors,
          undetectedErrors,
          totalBlocks,
          stoppedReason,
        });
      } else if (msg.type === 'error') {
        cleanup();
        reject(new Error(msg.message || 'Ошибка симуляции в потоке'));
      }
    };

    worker.onerror = (err) => {
      cleanup();
      reject(err);
    };

    worker.postMessage({
      type: 'start',
      id: reqId,
      config: cfg,
      batchSize: 50000,
    });
  });
}

export function exportToCsv(rows: SimulationResultRow[]): void {
  const headers = [
    '#',
    'Размер блока (n)',
    'Инф. бит (k)',
    'Проверочных бит (r)',
    'Модель канала',
    'Полином g(x)',
    'Верно принятые',
    'Обнаружено ошибок',
    'Не обнаружено ошибок',
    'Всего блоков',
    'Причина остановки',
  ];

  const csvRows = rows.map((r) => [
    r.index,
    r.blockSize,
    r.infoSize,
    r.blockSize - r.infoSize,
    `"${r.channelModel}"`,
    `"${r.polyString}"`,
    r.correctBlocks,
    r.detectedErrors,
    r.undetectedErrors,
    r.totalBlocks,
    r.stoppedReason === 'limit_blocks'
      ? 'Лимит блоков'
      : r.stoppedReason === 'limit_errors'
        ? 'Лимит ошибок'
        : 'Вручную',
  ]);

  const csvContent =
    '\uFEFF' + [headers.join(';'), ...csvRows.map((e) => e.join(';'))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `crclabmod_results_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
