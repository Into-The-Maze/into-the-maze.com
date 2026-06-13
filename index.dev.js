/* ============================================================
   INTO THE MAZE GAMES — index.js
============================================================ */

/* ──────────────────────────────────────────────────────────
   1. RECURSIVE BACKTRACKER MAZE on <canvas>
   Generates a unique perfect maze every page load.
   Draws it as thin rust-coloured corridors on soot bg.
────────────────────────────────────────────────────────── */
(function generateMaze() {
    const canvas = document.getElementById('mazeCanvas');
    if (!canvas) return;

    // Size canvas to window
    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();

    const ctx = canvas.getContext('2d');

    // Cell size — smaller = denser maze
    const CELL = 28;

    const cols = Math.ceil(canvas.width  / CELL) + 1;
    const rows = Math.ceil(canvas.height / CELL) + 1;

    // Each cell has 4 walls: N=0 E=1 S=2 W=3
    // We'll store which walls are REMOVED (open passages)
    // walls[r][c] = Set of directions that are open
    const N = 0, E = 1, S = 2, W = 3;
    const OPPOSITE = [S, W, N, E];
    const DR = [-1,  0, 1,  0];  // row delta for N,E,S,W
    const DC = [ 0,  1, 0, -1];  // col delta

    // visited flag
    const visited = Array.from({length: rows}, () => new Array(cols).fill(false));
    // open passages: true means wall removed in that direction
    const open = Array.from({length: rows}, () =>
        Array.from({length: cols}, () => [false, false, false, false])
    );

    // Iterative DFS recursive backtracker
    function carve() {
        const stack = [];
        const startR = Math.floor(Math.random() * rows);
        const startC = Math.floor(Math.random() * cols);
        visited[startR][startC] = true;
        stack.push([startR, startC]);

        while (stack.length > 0) {
            const [r, c] = stack[stack.length - 1];

            // Shuffle directions
            const dirs = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
            let moved = false;

            for (const d of dirs) {
                const nr = r + DR[d];
                const nc = c + DC[d];
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]) {
                    // Remove wall between current and neighbour
                    open[r][c][d]           = true;
                    open[nr][nc][OPPOSITE[d]] = true;
                    visited[nr][nc] = true;
                    stack.push([nr, nc]);
                    moved = true;
                    break;
                }
            }
            if (!moved) stack.pop();
        }
    }

    carve();

    // ── Draw the maze ──
    // Strategy: draw wall segments that are NOT open.
    // We iterate every cell and draw its North and West walls only
    // (South/East are covered by the neighbour's North/West).
    // Then draw the border.

    const RUST  = 'rgba(196, 92, 26, 0.9)';   // wall colour
    const LINE  = 1;                            // wall thickness (px)

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = RUST;
        ctx.lineWidth   = LINE;
        ctx.lineCap     = 'square';

        ctx.beginPath();

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = c * CELL;
                const y = r * CELL;

                // North wall (top edge of cell)
                if (!open[r][c][N]) {
                    ctx.moveTo(x,        y);
                    ctx.lineTo(x + CELL, y);
                }
                // West wall (left edge of cell)
                if (!open[r][c][W]) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, y + CELL);
                }
                // South wall — only for bottom-most row
                if (r === rows - 1 && !open[r][c][S]) {
                    ctx.moveTo(x,        y + CELL);
                    ctx.lineTo(x + CELL, y + CELL);
                }
                // East wall — only for right-most col
                if (c === cols - 1 && !open[r][c][E]) {
                    ctx.moveTo(x + CELL, y);
                    ctx.lineTo(x + CELL, y + CELL);
                }
            }
        }

        ctx.stroke();
    }

    draw();

    // Regenerate on resize (debounced)
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resize();
            // Reset and re-carve for new dimensions
            for (let r = 0; r < rows; r++)
                for (let c = 0; c < cols; c++) {
                    visited[r] && (visited[r][c] = false);
                    open[r]    && (open[r][c]    = [false,false,false,false]);
                }
            carve();
            draw();
        }, 200);
    }, { passive: true });
})();


/* ──────────────────────────────────────────────────────────
   2. EMBER PARTICLES
────────────────────────────────────────────────────────── */
(function spawnParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 38; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.cssText = `
            left: ${Math.random() * 100}%;
            --dur:   ${7 + Math.random() * 11}s;
            --delay: ${-Math.random() * 14}s;
            --drift: ${(Math.random() - 0.5) * 100}px;
        `;
        container.appendChild(p);
    }
})();


/* ──────────────────────────────────────────────────────────
   3. NAV — scroll class + mobile toggle
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
   4. SCROLL REVEAL
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
   5. MAZE COUNTER — increments every 2–5 s randomly
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
   6. MAILING LIST FORMS
────────────────────────────────────────────────────────── */
async function handleMailingSubmit(e, successId) {
  e.preventDefault();
  const form = e.target;
  const input = form.querySelector('input[type="email"]');
  const email = input.value;
  const successEl = document.getElementById(successId);

  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (res.ok || res.status === 409) { // 409 = already subscribed, still show success
      input.value = '';
      input.disabled = true;
      form.querySelectorAll('button').forEach(b => b.disabled = true);
      if (successEl) successEl.classList.add('show');
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
   8. SMOOTH SCROLL for anchor links
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
