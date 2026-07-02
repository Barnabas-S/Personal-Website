(() => {
    'use strict';

    const demo = document.getElementById('mc-demo');
    if (!demo) return;

    // Model parameters (European call under Black-Scholes)
    const S0 = 100;
    const K = 90;
    const r = 0.03;
    const T = 1;

    const N_DRAWS = 20000;
    const N_PATHS = 60;
    const N_STEPS = 120;

    const COLOR = {
        violet: '#6d4fc4',
        teal: '#1baf7a',
        gray: 'rgba(140, 135, 160, 0.35)',
        violetPath: 'rgba(109, 79, 196, 0.35)',
        muted: '#8a879a',
        grid: '#efedf5',
        axis: '#c8c5d4',
        ink: '#1a1a1a'
    };

    function mulberry32(a) {
        return () => {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function makeGauss(rng) {
        let spare = null;
        return () => {
            if (spare !== null) {
                const v = spare;
                spare = null;
                return v;
            }
            const u1 = 1 - rng();
            const u2 = rng();
            const mag = Math.sqrt(-2 * Math.log(u1));
            spare = mag * Math.sin(2 * Math.PI * u2);
            return mag * Math.cos(2 * Math.PI * u2);
        };
    }

    function normCdf(x) {
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989422804014327 * Math.exp(-x * x / 2);
        const p = d * t * (0.319381530 + t * (-0.356563782 +
            t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
        return x > 0 ? 1 - p : p;
    }

    function bsCall(sigma) {
        const d1 = (Math.log(S0 / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
        const d2 = d1 - sigma * Math.sqrt(T);
        return S0 * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
    }

    function discountedPayoff(z, sigma) {
        const st = S0 * Math.exp((r - sigma * sigma / 2) * T + sigma * Math.sqrt(T) * z);
        return Math.exp(-r * T) * Math.max(st - K, 0);
    }

    // Log-spaced checkpoints (even, so plain and antithetic budgets match)
    const CHECKPOINTS = (() => {
        const out = [];
        const k = 80;
        for (let i = 0; i < k; i++) {
            let n = Math.round(100 * Math.pow(N_DRAWS / 100, i / (k - 1)));
            n += n % 2;
            if (!out.includes(n)) out.push(n);
        }
        return out;
    })();

    function simulate(sigma, seed) {
        const rng = mulberry32(seed);
        const gauss = makeGauss(rng);

        // Sample paths for the first chart
        const dt = T / N_STEPS;
        const drift = (r - sigma * sigma / 2) * dt;
        const vol = sigma * Math.sqrt(dt);
        const paths = [];
        for (let p = 0; p < N_PATHS; p++) {
            const path = new Float64Array(N_STEPS + 1);
            path[0] = S0;
            for (let s = 1; s <= N_STEPS; s++) {
                path[s] = path[s - 1] * Math.exp(drift + vol * gauss());
            }
            paths.push(path);
        }

        // Convergence experiment: plain MC vs antithetic variates,
        // both measured in total payoff evaluations.
        let sumP = 0, sumP2 = 0;
        let sumA = 0, sumA2 = 0, pairs = 0;
        const est = [];
        let ci = 0;
        for (let i = 1; i <= N_DRAWS; i++) {
            const y = discountedPayoff(gauss(), sigma);
            sumP += y;
            sumP2 += y * y;
            if (i % 2 === 0) {
                const z = gauss();
                const v = (discountedPayoff(z, sigma) + discountedPayoff(-z, sigma)) / 2;
                pairs++;
                sumA += v;
                sumA2 += v * v;
            }
            if (ci < CHECKPOINTS.length && i === CHECKPOINTS[ci]) {
                est.push({ n: i, plain: sumP / i, anti: sumA / pairs });
                ci++;
            }
        }

        const meanP = sumP / N_DRAWS;
        const varP = (sumP2 - N_DRAWS * meanP * meanP) / (N_DRAWS - 1);
        const meanA = sumA / pairs;
        const varA = (sumA2 - pairs * meanA * meanA) / (pairs - 1);
        const seP = Math.sqrt(varP / N_DRAWS);
        const seA = Math.sqrt(varA / pairs);

        return {
            sigma,
            paths,
            est,
            bs: bsCall(sigma),
            plain: { mean: meanP, se: seP },
            anti: { mean: meanA, se: seA },
            vrf: (varP / N_DRAWS) / (varA / pairs)
        };
    }

    // ---- Chart plumbing ----

    const M = { top: 10, right: 14, bottom: 26, left: 46 };

    function setupCanvas(canvas) {
        const rect = canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx, w: rect.width, h: rect.height };
    }

    function niceTicks(lo, hi, count) {
        const span = hi - lo;
        const step = Math.pow(10, Math.floor(Math.log10(span / count)));
        const err = span / count / step;
        const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
        const s = step * mult;
        const ticks = [];
        for (let v = Math.ceil(lo / s) * s; v <= hi + s * 1e-9; v += s) {
            ticks.push(Math.round(v * 1e6) / 1e6);
        }
        return ticks;
    }

    function drawFrame(ctx, w, h, yTicks, yScale, fmt) {
        ctx.clearRect(0, 0, w, h);
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillStyle = COLOR.muted;
        ctx.strokeStyle = COLOR.grid;
        ctx.lineWidth = 1;
        yTicks.forEach((t) => {
            const y = Math.round(yScale(t)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(M.left, y);
            ctx.lineTo(w - M.right, y);
            ctx.stroke();
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(fmt(t), M.left - 8, y);
        });
        ctx.strokeStyle = COLOR.axis;
        ctx.beginPath();
        ctx.moveTo(M.left + 0.5, M.top);
        ctx.lineTo(M.left + 0.5, h - M.bottom + 0.5);
        ctx.lineTo(w - M.right, h - M.bottom + 0.5);
        ctx.stroke();
    }

    function drawXTick(ctx, x, h, label) {
        ctx.fillStyle = COLOR.muted;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(label, x, h - M.bottom + 7);
    }

    function dashedLine(ctx, x0, x1, y, color) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x0, y + 0.5);
        ctx.lineTo(x1, y + 0.5);
        ctx.stroke();
        ctx.restore();
    }

    // ---- Paths chart ----

    const pathsWrap = document.getElementById('mc-paths-wrap');
    const pathsCanvas = document.getElementById('mc-paths');
    const pathsTip = pathsWrap.querySelector('.mc-tip');
    const pathsHair = pathsWrap.querySelector('.mc-crosshair');
    let pathsGeom = null;

    function drawPaths(sim) {
        const { ctx, w, h } = setupCanvas(pathsCanvas);
        let lo = Infinity, hi = -Infinity;
        sim.paths.forEach((p) => {
            for (let i = 0; i <= N_STEPS; i++) {
                if (p[i] < lo) lo = p[i];
                if (p[i] > hi) hi = p[i];
            }
        });
        lo = Math.min(lo, K) - 5;
        hi = Math.max(hi, K) + 5;
        const xs = (i) => M.left + (i / N_STEPS) * (w - M.left - M.right);
        const ys = (v) => M.top + (1 - (v - lo) / (hi - lo)) * (h - M.top - M.bottom);
        const yTicks = niceTicks(lo, hi, 5);
        drawFrame(ctx, w, h, yTicks, ys, (t) => String(Math.round(t)));

        for (let m = 0; m <= 12; m += 3) {
            drawXTick(ctx, xs((m / 12) * N_STEPS), h, m === 0 ? '0' : m + ' mo');
        }

        ctx.lineWidth = 1.25;
        ctx.lineJoin = 'round';
        // Worthless paths first so in-the-money paths sit on top
        [false, true].forEach((itm) => {
            ctx.strokeStyle = itm ? COLOR.violetPath : COLOR.gray;
            sim.paths.forEach((p) => {
                if ((p[N_STEPS] > K) !== itm) return;
                ctx.beginPath();
                ctx.moveTo(xs(0), ys(p[0]));
                for (let i = 1; i <= N_STEPS; i++) ctx.lineTo(xs(i), ys(p[i]));
                ctx.stroke();
            });
        });

        dashedLine(ctx, M.left, w - M.right, Math.round(ys(K)), COLOR.muted);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeText('Strike K = ' + K, w - M.right, ys(K) - 3);
        ctx.fillStyle = COLOR.muted;
        ctx.fillText('Strike K = ' + K, w - M.right, ys(K) - 3);

        pathsGeom = { w, h, xs, ys };
    }

    function pathsStats(step) {
        const vals = current.paths.map((p) => p[step]).sort((a, b) => a - b);
        const q = (f) => vals[Math.min(vals.length - 1, Math.round(f * (vals.length - 1)))];
        const above = vals.filter((v) => v > K).length;
        return { med: q(0.5), p10: q(0.1), p90: q(0.9), pct: Math.round(100 * above / vals.length) };
    }

    function showPathsTip(step) {
        const g = pathsGeom;
        const s = pathsStats(step);
        const months = (step / N_STEPS) * 12;
        const x = g.xs(step);
        pathsHair.style.display = 'block';
        pathsHair.style.left = x + 'px';
        pathsHair.style.height = (g.h - M.bottom) + 'px';
        pathsTip.replaceChildren(
            tipHead('Month ' + months.toFixed(1)),
            tipRow('mc-key--violet', s.med.toFixed(1), 'median price'),
            tipRow('mc-key--gray', s.p10.toFixed(0) + ' to ' + s.p90.toFixed(0), '10th to 90th pct'),
            tipRow('mc-key--dash', s.pct + '%', 'of paths above strike')
        );
        placeTip(pathsTip, pathsWrap, x);
    }

    // ---- Convergence chart ----

    const convWrap = document.getElementById('mc-conv-wrap');
    const convCanvas = document.getElementById('mc-conv');
    const convTip = convWrap.querySelector('.mc-tip');
    const convHair = convWrap.querySelector('.mc-crosshair');
    let convGeom = null;

    function drawConv(sim) {
        const { ctx, w, h } = setupCanvas(convCanvas);
        let lo = sim.bs, hi = sim.bs;
        sim.est.forEach((e) => {
            lo = Math.min(lo, e.plain, e.anti);
            hi = Math.max(hi, e.plain, e.anti);
        });
        const pad = (hi - lo) * 0.12 + 0.05;
        lo -= pad;
        hi += pad;

        const lgLo = Math.log10(CHECKPOINTS[0]);
        const lgHi = Math.log10(N_DRAWS);
        const xs = (n) => M.left + ((Math.log10(n) - lgLo) / (lgHi - lgLo)) * (w - M.left - M.right);
        const ys = (v) => M.top + (1 - (v - lo) / (hi - lo)) * (h - M.top - M.bottom);
        drawFrame(ctx, w, h, niceTicks(lo, hi, 5), ys, (t) => t.toFixed(1));

        [100, 1000, 10000].forEach((n) => {
            drawXTick(ctx, xs(n), h, n.toLocaleString('en-US'));
        });

        dashedLine(ctx, M.left, w - M.right, Math.round(ys(sim.bs)), COLOR.muted);

        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        [['plain', COLOR.violet], ['anti', COLOR.teal]].forEach(([key, color]) => {
            ctx.strokeStyle = color;
            ctx.beginPath();
            sim.est.forEach((e, i) => {
                const x = xs(e.n);
                const y = ys(e[key]);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
        });

        convGeom = { w, h, xs, ys };
    }

    function showConvTip(idx) {
        const e = current.est[idx];
        const x = convGeom.xs(e.n);
        convHair.style.display = 'block';
        convHair.style.left = x + 'px';
        convHair.style.height = (convGeom.h - M.bottom) + 'px';
        convTip.replaceChildren(
            tipHead(e.n.toLocaleString('en-US') + ' payoff samples'),
            tipRow('mc-key--violet', e.plain.toFixed(3), 'plain Monte Carlo'),
            tipRow('mc-key--teal', e.anti.toFixed(3), 'antithetic variates'),
            tipRow('mc-key--dash', current.bs.toFixed(3), 'Black-Scholes exact')
        );
        placeTip(convTip, convWrap, x);
    }

    // ---- Tooltip helpers ----

    function tipHead(text) {
        const div = document.createElement('div');
        div.className = 'mc-tip-head';
        div.textContent = text;
        return div;
    }

    function tipRow(keyClass, value, label) {
        const row = document.createElement('div');
        row.className = 'mc-tip-row';
        const key = document.createElement('span');
        key.className = 'mc-key ' + keyClass;
        const strong = document.createElement('strong');
        strong.textContent = value;
        row.append(key, strong, document.createTextNode(' ' + label));
        return row;
    }

    function placeTip(tip, wrap, x) {
        tip.style.display = 'block';
        tip.style.top = '8px';
        const width = tip.offsetWidth;
        const flip = x + 14 + width > wrap.clientWidth;
        tip.style.left = flip ? (x - width - 14) + 'px' : (x + 14) + 'px';
    }

    function hideTip(wrap) {
        wrap.querySelector('.mc-tip').style.display = 'none';
        wrap.querySelector('.mc-crosshair').style.display = 'none';
    }

    function bindHover(wrap, indexCount, nearestIdx, show) {
        let focusIdx = -1;
        wrap.addEventListener('pointermove', (ev) => {
            const rect = wrap.getBoundingClientRect();
            show(nearestIdx(ev.clientX - rect.left));
        });
        wrap.addEventListener('pointerleave', () => {
            focusIdx = -1;
            hideTip(wrap);
        });
        wrap.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') {
                focusIdx = -1;
                hideTip(wrap);
                return;
            }
            if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
            ev.preventDefault();
            const step = ev.key === 'ArrowRight' ? 1 : -1;
            focusIdx = Math.max(0, Math.min(indexCount() - 1,
                (focusIdx < 0 ? Math.floor(indexCount() / 2) : focusIdx) + step));
            show(focusIdx);
        });
        wrap.addEventListener('blur', () => {
            focusIdx = -1;
            hideTip(wrap);
        });
    }

    // ---- Stats row ----

    function fmtCi(stat) {
        return '±95% CI ' + (1.96 * stat.se).toFixed(3);
    }

    function renderStats(sim) {
        document.getElementById('mc-stat-bs').textContent = sim.bs.toFixed(3);
        document.getElementById('mc-stat-plain').textContent = sim.plain.mean.toFixed(3);
        document.getElementById('mc-stat-plain-ci').textContent = fmtCi(sim.plain);
        document.getElementById('mc-stat-anti').textContent = sim.anti.mean.toFixed(3);
        document.getElementById('mc-stat-anti-ci').textContent = fmtCi(sim.anti);
        document.getElementById('mc-stat-vrf').textContent = sim.vrf.toFixed(1) + '×';
    }

    // ---- Wiring ----

    let seed = 20260702;
    let current = null;

    function run() {
        const sigma = Number(sigmaInput.value) / 100;
        sigmaOut.value = sigmaInput.value + '%';
        current = simulate(sigma, seed);
        drawPaths(current);
        drawConv(current);
        renderStats(current);
        hideTip(pathsWrap);
        hideTip(convWrap);
    }

    const sigmaInput = document.getElementById('mc-sigma');
    const sigmaOut = document.getElementById('mc-sigma-out');

    let raf = null;
    sigmaInput.addEventListener('input', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = null;
            run();
        });
    });

    document.getElementById('mc-rerun').addEventListener('click', () => {
        seed = (Math.random() * 0x7fffffff) | 0;
        run();
    });

    bindHover(pathsWrap,
        () => N_STEPS + 1,
        (px) => {
            const g = pathsGeom;
            const f = (px - M.left) / (g.w - M.left - M.right);
            return Math.max(0, Math.min(N_STEPS, Math.round(f * N_STEPS)));
        },
        showPathsTip);

    bindHover(convWrap,
        () => current.est.length,
        (px) => {
            let best = 0, bestD = Infinity;
            current.est.forEach((e, i) => {
                const d = Math.abs(convGeom.xs(e.n) - px);
                if (d < bestD) { bestD = d; best = i; }
            });
            return best;
        },
        showConvTip);

    if ('ResizeObserver' in window) {
        let first = true;
        new ResizeObserver(() => {
            if (first) { first = false; return; }
            if (!current) return;
            drawPaths(current);
            drawConv(current);
        }).observe(demo);
    }

    run();
})();
