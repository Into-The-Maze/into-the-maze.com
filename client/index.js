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
    const SPEED = 0.18;
    const COLOR = 'rgba(196, 92, 26, 0.9)';

    const DR  = [-1, 0, 1, 0];
    const DC  = [ 0, 1, 0, -1];
    const OPP = [ 2, 3, 0,  1];

    let cols, rows, walls, tileW, tileH;
    let off, octx, ctx;
    let ox = 0, oy = 0;
    let raf = null;

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
            walls[r][c][d] = 1; walls[nr][nc][OPP[d]] = 1;
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
        drawTile(octx, 0,     0);
        drawTile(octx, tileW, 0);
        drawTile(octx, 0,     tileH);
        drawTile(octx, tileW, tileH);
    }

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
    }

    function tick() {
        ox += SPEED; oy += SPEED;
        if (ox >= tileW) ox -= tileW;
        if (oy >= tileH) oy -= tileH;
        ctx.clearRect(0, 0, display.width, display.height);
        ctx.drawImage(off, -ox, -oy);
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