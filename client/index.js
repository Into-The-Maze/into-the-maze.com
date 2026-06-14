/* ============================================================
   INTO THE MAZE GAMES — index.js
============================================================ */

/* ──────────────────────────────────────────────────────────
   1. SEAMLESS SCROLLING MAZE BACKGROUND (toroidal)
────────────────────────────────────────────────────────── */
(function infiniteMaze() {
    const display = document.getElementById('mazeCanvas');
    if (!display) return;

    const CELL  = 32;
    const SPEED = 0.12;
    const COLOR = 'rgba(196, 92, 26, 0.35)';

    // Solver tunables
    const S_PX_PER_FRAME = 2.2;
    const TRAIL_CELLS = 32;
    const MIN_DIST = 10;

    const DR  = [-1, 0, 1, 0];
    const DC  = [ 0, 1, 0, -1];
    const OPP = [ 2, 3, 0,  1];

    let cols, rows, walls, tileW, tileH;
    let off, octx, ctx;
    let ox = 0, oy = 0;
    let raf = null;

    // ── Maze generation ──────────────────────────────────────
    function buildToroidalMaze() {
        walls = Array.from({length: rows}, () =>
            Array.from({length: cols}, () => new Uint8Array(4))
        );
        const vis = Array.from({length: rows}, () => new Uint8Array(cols));
        const sr = Math.floor(Math.random() * rows);
        const sc = Math.floor(Math.random() * cols);
        const stack = [[sr, sc]];
        vis[sr][sc] = 1;
        while (stack.length) {
            const [r, c] = stack[stack.length - 1];
            const cand = [];
            for (let d = 0; d < 4; d++) {
                const nr = (r + DR[d] + rows) % rows;
                const nc = (c + DC[d] + cols) % cols;
                if (!vis[nr][nc]) cand.push(d);
            }
            if (!cand.length) { stack.pop(); continue; }
            const d  = cand[Math.floor(Math.random() * cand.length)];
            const nr = (r + DR[d] + rows) % rows;
            const nc = (c + DC[d] + cols) % cols;
            walls[r][c][d] = 1;
            walls[nr][nc][OPP[d]] = 1;
            vis[nr][nc] = 1;
            stack.push([nr, nc]);
        }
    }

    function drawTile(cx, offX, offY) {
        cx.beginPath();
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = offX + c * CELL, y = offY + r * CELL;
                if (!walls[r][c][0]) { cx.moveTo(x, y); cx.lineTo(x + CELL, y); }
                if (!walls[r][c][3]) { cx.moveTo(x, y); cx.lineTo(x, y + CELL); }
            }
        }
        cx.stroke();
    }

    function buildBuffer() {
        off = document.createElement('canvas');
        off.width = tileW * 2; off.height = tileH * 2;
        octx = off.getContext('2d');
        octx.strokeStyle = COLOR; octx.lineWidth = 1; octx.lineCap = 'square';
        drawTile(octx, 0,     0);     drawTile(octx, tileW, 0);
        drawTile(octx, 0,     tileH); drawTile(octx, tileW, tileH);
    }

    // ── Coordinate helpers ───────────────────────────────────
    // Screen px → maze cell (accounting for current scroll offset)
    function screenToCell(sx, sy) {
        const mx = ((sx + ox) % tileW + tileW) % tileW;
        const my = ((sy + oy) % tileH + tileH) % tileH;
        return [Math.floor(my / CELL), Math.floor(mx / CELL)];
    }

    // Maze cell → centre in screen px
    function cellToScreen(r, c) {
        const mx = c * CELL + CELL / 2;
        const my = r * CELL + CELL / 2;
        let sx = ((mx - ox) % tileW + tileW) % tileW;
        let sy = ((my - oy) % tileH + tileH) % tileH;
        return [sx, sy];
    }

    // ── BFS pathfinder ───────────────────────────────────────
    function bfs(sr, sc, gr, gc) {
        const prev = Array.from({length: rows}, () => new Int16Array(cols).fill(-1));
        // encode parent as r*cols+c, use -2 for start
        const key = (r, c) => r * cols + c;
        const parentR = Array.from({length: rows}, () => new Int16Array(cols).fill(-1));
        const parentC = Array.from({length: rows}, () => new Int16Array(cols).fill(-1));
        const visited = Array.from({length: rows}, () => new Uint8Array(cols));
        const q = [[sr, sc]];
        visited[sr][sc] = 1;
        while (q.length) {
            const [r, c] = q.shift();
            if (r === gr && c === gc) break;
            for (let d = 0; d < 4; d++) {
                if (!walls[r][c][d]) continue;
                const nr = (r + DR[d] + rows) % rows;
                const nc = (c + DC[d] + cols) % cols;
                if (visited[nr][nc]) continue;
                visited[nr][nc] = 1;
                parentR[nr][nc] = r;
                parentC[nr][nc] = c;
                q.push([nr, nc]);
            }
        }
        // Reconstruct path
        const path = [];
        let r = gr, c = gc;
        while (!(r === sr && c === sc)) {
            path.unshift([r, c]);
            const pr = parentR[r][c];
            const pc = parentC[r][c];
            if (pr === -1) return [[sr, sc]]; // no path found
            r = pr; c = pc;
        }
        path.unshift([sr, sc]);
        return path;
    }

    // ── Solver state ─────────────────────────────────────────
    // The solver lives in SCREEN SPACE (sx, sy).
    // It moves toward the centre of the next waypoint cell.
    // When it arrives, it picks the next cell from its BFS path.
    // "Against the scroll" means: pick targets that are toward the
    // top-left of screen (opposite to the down-right scroll drift).

    let sol = {
        sx: 0, sy: 0,           // current screen position (px)
        r: 0,  c: 0,            // current maze cell
        path: [],               // remaining [r,c] waypoints
        trail: [],              // last N screen positions [{sx,sy}]
        tx: 0, ty: 0,           // target screen position
    };

    function solverPickTarget() {
        // Always pick a target that is UP and to the LEFT on screen —
        // directly opposing the down-right scroll. Score by how far
        // top-left the candidate cell currently appears on screen.
        const cx = display.width  / 2;
        const cy = display.height / 2;

        let best = null, bestScore = -Infinity;
        for (let attempt = 0; attempt < 40; attempt++) {
            const tr = Math.floor(Math.random() * rows);
            const tc = Math.floor(Math.random() * cols);
            const cellDist = Math.abs(tr - sol.r) + Math.abs(tc - sol.c);
            if (cellDist < MIN_DIST) continue;
            const [tsx, tsy] = cellToScreen(tr, tc);
            // Strong bias toward top-left quadrant of screen
            // Subtract from centre so cells in top-left score highest
            const screenBias = (cx - tsx) + (cy - tsy);
            const score = screenBias + Math.random() * CELL * 3;
            if (score > bestScore) { bestScore = score; best = [tr, tc]; }
        }
        if (!best) {
            // Fallback: go to opposite corner of maze
            best = [
                (sol.r + Math.floor(rows / 2)) % rows,
                (sol.c + Math.floor(cols / 2)) % cols
            ];
        }
        const path = bfs(sol.r, sol.c, best[0], best[1]);
        sol.path = path.slice(1);
        advancePath();
    }

    function advancePath() {
        if (!sol.path.length) { solverPickTarget(); return; }
        const [nr, nc] = sol.path[0];
        sol.path.shift();
        sol.r = nr; sol.c = nc;
        const [tsx, tsy] = cellToScreen(nr, nc);
        sol.tx = tsx; sol.ty = tsy;
    }

    function initSolver() {
        // Start near centre of screen
        const [r, c] = screenToCell(
            display.width  / 2 + (Math.random() - 0.5) * CELL * 4,
            display.height / 2 + (Math.random() - 0.5) * CELL * 4
        );
        sol.r = ((r % rows) + rows) % rows;
        sol.c = ((c % cols) + cols) % cols;
        const [sx, sy] = cellToScreen(sol.r, sol.c);
        sol.sx = sx; sol.sy = sy;
        sol.tx = sx; sol.ty = sy;
        sol.trail = [];
        sol.path  = [];
        solverPickTarget();
    }

    function stepSolver() {
        // Recompute target screen pos from its maze cell each frame
        // so the target moves with the scrolling maze
        const [tsx, tsy] = cellToScreen(sol.r, sol.c);
        sol.tx = tsx; sol.ty = tsy;

        let dx = sol.tx - sol.sx;
        let dy = sol.ty - sol.sy;
        if (dx >  display.width  / 2) dx -= tileW;
        if (dx < -display.width  / 2) dx += tileW;
        if (dy >  display.height / 2) dy -= tileH;
        if (dy < -display.height / 2) dy += tileH;

        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < S_PX_PER_FRAME) {
            // Snap to cell centre, record cell in MAZE coords
            sol.sx = sol.tx;
            sol.sy = sol.ty;
            sol.trail.push({ r: sol.r, c: sol.c });
            if (sol.trail.length > TRAIL_CELLS) sol.trail.shift();
            if (sol.path.length) advancePath();
            else solverPickTarget();
        } else {
            sol.sx += (dx / dist) * S_PX_PER_FRAME;
            sol.sy += (dy / dist) * S_PX_PER_FRAME;
        }

        // Off-screen guard
        const margin = CELL;
        if (sol.sx < -margin || sol.sx > display.width  + margin ||
            sol.sy < -margin || sol.sy > display.height + margin) {
            initSolver();
        }
    }

    function drawSolver() {
        ctx.save();
        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';

        const trail = sol.trail;
        
        // Trail: each segment is cell-centre to cell-centre in screen space
        // — computed fresh each frame so it moves with the maze perfectly
        if (trail.length >= 2) {
            for (let i = 1; i < trail.length; i++) {
                const t = i / trail.length;             // 0=oldest 1=newest
                const [x1, y1] = cellToScreen(trail[i-1].r, trail[i-1].c);
                const [x2, y2] = cellToScreen(trail[i].r,   trail[i].c);
                // Skip segments that cross the torus seam (would draw a line across screen)
                if (Math.abs(x2 - x1) > tileW / 2 || Math.abs(y2 - y1) > tileH / 2) continue;
                ctx.strokeStyle = `rgba(255,100,0,${(t * 0.85 + 0.1).toFixed(3)})`;
                ctx.lineWidth   = 2 + t * 5;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }

            // Live segment: last cell centre → current interpolated position
            if (trail.length >= 1) {
                const [lx, ly] = cellToScreen(trail[trail.length - 1].r, trail[trail.length - 1].c);
                if (Math.abs(sol.sx - lx) < tileW / 2 && Math.abs(sol.sy - ly) < tileH / 2) {
                    ctx.strokeStyle = 'rgba(255,100,0,1)';
                    ctx.lineWidth   = 7;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(lx, ly);
                    ctx.lineTo(sol.sx, sol.sy);
                    ctx.stroke();
                }
            }
        }

        // Glow halo
        ctx.shadowColor = 'rgba(255,80,0,1)';
        ctx.shadowBlur  = 28;
        ctx.strokeStyle = 'rgba(255,130,20,0.3)';
        ctx.lineWidth   = 5;
        ctx.beginPath();
        ctx.arc(sol.sx, sol.sy, 8, 0, Math.PI * 2);
        ctx.stroke();

        // Bright core dot
        ctx.shadowColor = 'rgba(255,140,0,1)';
        ctx.shadowBlur  = 14;
        ctx.fillStyle   = '#ff6600';
        ctx.beginPath();
        ctx.arc(sol.sx, sol.sy, 8, 0, Math.PI * 2);
        ctx.fill();

        // White hot centre pinprick
        ctx.shadowBlur = 0;
        ctx.fillStyle  = 'rgba(255,240,200,1)';
        ctx.beginPath();
        ctx.arc(sol.sx, sol.sy, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // ── Init & loop ──────────────────────────────────────────
    function init() {
        display.width  = window.innerWidth;
        display.height = window.innerHeight;
        ctx = display.getContext('2d');
        cols  = Math.ceil(window.innerWidth  / CELL) + 2;
        rows  = Math.ceil(window.innerHeight / CELL) + 2;
        tileW = cols * CELL;
        tileH = rows * CELL;
        buildToroidalMaze();
        buildBuffer();
        ox = Math.random() * tileW;
        oy = Math.random() * tileH;
        initSolver();
    }

    function tick() {
        ox += SPEED; oy += SPEED;
        if (ox >= tileW) ox -= tileW;
        if (oy >= tileH) oy -= tileH;

        stepSolver();

        ctx.clearRect(0, 0, display.width, display.height);
        ctx.drawImage(off, -ox, -oy);
        drawSolver();
        raf = requestAnimationFrame(tick);
    }

    function start() { if (raf === null) raf = requestAnimationFrame(tick); }
    function stop()  { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } }

    init();
    start();

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop(); else start();
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { stop(); init(); start(); }, 200);
    }, { passive: true });
})();


/* ──────────────────────────────────────────────────────────
   2. NAV — scroll class + mobile toggle
────────────────────────────────────────────────────────── */
const nav       = document.getElementById('nav');
const navToggle = document.getElementById('navToggle');
const navLinks  = nav.querySelector('.nav-links');

window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => navLinks.classList.remove('open'))
);


/* ──────────────────────────────────────────────────────────
   3. SCROLL REVEAL
────────────────────────────────────────────────────────── */
const revealObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const siblings = [...entry.target.parentElement.querySelectorAll('.reveal')];
        const idx = siblings.indexOf(entry.target);
        entry.target.style.transitionDelay = `${idx * 0.07}s`;
        entry.target.classList.add('visible');
        revealObs.unobserve(entry.target);
    });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));


/* ──────────────────────────────────────────────────────────
   4. MAILING LIST FORMS (with API submit from friend's version)
────────────────────────────────────────────────────────── */
async function handleMailingSubmit(e, successId) {
    e.preventDefault();
    const form  = e.target;
    const input = form.querySelector('input[type="email"]');
    const email = input.value;
    const msg   = document.getElementById(successId);

    try {
        const res = await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        if (res.ok || res.status === 409) {
            input.value = '';
            input.disabled = true;
            form.querySelectorAll('button').forEach(b => b.disabled = true);
            if (msg) msg.classList.add('show');
        } else {
            input.setCustomValidity('Something went wrong, try again.');
            input.reportValidity();
            input.setCustomValidity('');
        }
    } catch {
        input.setCustomValidity('Something went wrong, try again.');
        input.reportValidity();
        input.setCustomValidity('');
    }
}


/* ──────────────────────────────────────────────────────────
   5. MAZE COUNTER
────────────────────────────────────────────────────────── */
(function mazeCounter() {
    const el = document.getElementById('maze-counter');
    if (!el) return;
    let count = parseInt(el.textContent.replace(/,/g, ''), 10) || 8673;
    function tick() {
        count += Math.floor(Math.random() * 4) + 1;
        el.textContent = count.toLocaleString('en-GB');
        el.classList.add('tick');
        setTimeout(() => el.classList.remove('tick'), 320);
        setTimeout(tick, 2000 + Math.random() * 3000);
    }
    setTimeout(tick, 1800);
})();


/* ──────────────────────────────────────────────────────────
   6. FOOTER YEAR
────────────────────────────────────────────────────────── */
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();


/* ──────────────────────────────────────────────────────────
   7. SMOOTH SCROLL
────────────────────────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
        const target = document.querySelector(a.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        const navH = parseInt(
            getComputedStyle(document.documentElement).getPropertyValue('--nav-h')
        ) || 72;
        window.scrollTo({
            top: target.getBoundingClientRect().top + window.scrollY - navH,
            behavior: 'smooth'
        });
    });
});