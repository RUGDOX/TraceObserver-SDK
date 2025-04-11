// Universal Web3 Fingerprint SDK: TraceObserver 
// by Jesse Hudelson of Rugdox LLC - See MIT License
(function (global) {
  const TraceObserver = {
    config: {},
    trace: {},
    customScorer: null,

    init(config = {}) {
      this.config = config;
      this.trace = {
        sessionStart: performance.now(),
        platform: config.platform_id || null,
        wallet: config.wallet || null,
        focusEvents: [],
        rpcTimeline: [],
        memorySamples: [],
        userActions: [],
        flags: [],
        resultHash: null
      };

      if (config.enableFocusEvents !== false) {
        window.addEventListener('blur', () => {
          this.trace.focusEvents.push({ type: 'blur', t: performance.now() });
        });
        window.addEventListener('focus', () => {
          this.trace.focusEvents.push({ type: 'focus', t: performance.now() });
        });
      }

      if (performance.memory && config.enableMemorySampling !== false) {
        this.trace.memorySamples.push({ t: performance.now(), heap: performance.memory.usedJSHeapSize });
        setTimeout(() => {
          this.trace.memorySamples.push({ t: performance.now(), heap: performance.memory.usedJSHeapSize });
        }, 500);
      }

      if (config.captureUserInput) {
        ['click', 'mousemove', 'keydown', 'scroll'].forEach(event => {
          window.addEventListener(event, (e) => {
            this.trace.userActions.push({ type: event, x: e.clientX || 0, y: e.clientY || 0, t: performance.now() });
          });
        });
      }

      if (window.ethereum && window.ethereum.request) {
        const originalRequest = window.ethereum.request;
        window.ethereum.request = async (args) => {
          const tsStart = performance.now();
          const result = await originalRequest.apply(window.ethereum, [args]);
          const tsEnd = performance.now();
          this.trace.rpcTimeline.push({ method: args.method, duration: +(tsEnd - tsStart).toFixed(2), ts: tsStart });
          return result;
        };
      }
    },

    setScorer(fn) {
      this.customScorer = fn;
    },

    async finalize() {
      this.trace.sessionEnd = performance.now();
      this.trace.sessionDuration = +(this.trace.sessionEnd - this.trace.sessionStart).toFixed(2);
      if (this.customScorer) {
        const scoring = await this.customScorer(this.trace);
        this.trace.risk = scoring;
      }

      const raw = JSON.stringify(this.trace);
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
      this.trace.resultHash = hex;
      return this.trace;
    },

    async submit(endpoint = null) {
      if (!this.config.submitEndpoint && !endpoint) {
        console.warn('[TraceObserver] No submit endpoint defined. Trace will not be sent.');
        return null;
      }
      const finalized = await this.finalize();
      const url = endpoint || this.config.submitEndpoint;
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalized)
        });
        if (this.config.debug) {
          console.log('[TraceObserver] Trace submitted:', finalized);
        }
      } catch (err) {
        console.error('[TraceObserver] Submission failed:', err);
      }
      return finalized;
    },

    export() {
      return this.trace;
    }
  };

  global.TraceObserver = TraceObserver;
})(window);
