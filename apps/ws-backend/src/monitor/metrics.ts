import { monitorEventLoopDelay } from "node:perf_hooks";

type Counters = {
  ingress: number;
  errors: number;
  backpressure: number;
};

type Rates = {
  ingressPerSec: number;
  errorsPerSec: number;
  dlqPerSec: number;
};

const counters: Counters = {
  ingress: 0,
  errors: 0,
  backpressure: 0,
};

const rates: Rates = {
  ingressPerSec: 0,
  errorsPerSec: 0,
  dlqPerSec: 0,
};

let lastIngress = 0;
let lastErrors = 0;
let lastDlq = 0;
let canvasLagAvgMs = 0;
let canvasLagSamples = 0;
let processingLatencyAvgMs = 0;
let processingLatencySamples = 0;
const recentErrors: Array<{
  at: string;
  stage?: string;
  type?: string;
  message: string;
}> = [];

const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();

let started = false;

export function startMetricsEngine() {
  if (started) return;
  started = true;

  setInterval(() => {
    const ingressDelta = counters.ingress - lastIngress;
    const errorDelta = counters.errors - lastErrors;

    rates.ingressPerSec = ingressDelta;
    rates.errorsPerSec = errorDelta;

    lastIngress = counters.ingress;
    lastErrors = counters.errors;
  }, 1000);
}

export function recordIngress() {
  counters.ingress += 1;
}

export function recordError() {
  counters.errors += 1;
}

export function recordErrorDetail(detail: {
  stage?: string;
  type?: string;
  message: string;
}) {
  recentErrors.unshift({
    at: new Date().toISOString(),
    stage: detail.stage,
    type: detail.type,
    message: detail.message,
  });

  if (recentErrors.length > 25) {
    recentErrors.length = 25;
  }
}

export function recordBackpressureTrigger() {
  counters.backpressure += 1;
}

export function recordCanvasConsumerLagMs(ms: number) {
  if (ms < 0) return;

  canvasLagSamples += 1;
  const weight = 1 / canvasLagSamples;
  canvasLagAvgMs = canvasLagAvgMs * (1 - weight) + ms * weight;
}

export function recordProcessingLatencyMs(ms: number) {
  if (ms < 0) return;

  processingLatencySamples += 1;
  const weight = 1 / processingLatencySamples;
  processingLatencyAvgMs = processingLatencyAvgMs * (1 - weight) + ms * weight;
}

export function recordDlqDepth(currentDepth: number) {
  const delta = Math.max(0, currentDepth - lastDlq);
  rates.dlqPerSec = delta;
  lastDlq = currentDepth;
}

export function getMetricsSnapshot() {
  return {
    ingressRate: rates.ingressPerSec,
    errorRate: rates.errorsPerSec,
    dlqRate: rates.dlqPerSec,
    backpressureTriggerCount: counters.backpressure,
    consumerLag: {
      canvasLag: Math.round(canvasLagAvgMs),
    },
    processingLatency: Math.round(processingLatencyAvgMs),
    recentErrors,
    system: {
      uptime: Math.floor(process.uptime()),
      memoryUsage: process.memoryUsage(),
      eventLoopLag: Math.round(loop.mean / 1_000_000),
    },
  };
}
