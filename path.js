// Draws the lantern path: a winding trail from "Start" to the goal flag,
// with one lantern per daily task. Lit lanterns are tasks you've finished.
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const WIDTH = 340;
  const PER_ROW = 5;      // lanterns in each row of the winding path
  const ROW_GAP = 66;     // vertical space between rows
  const TOP = 64;         // room above the last row for the flag
  const BOTTOM = 46;      // room below the first row

  function el(name, attrs, parent) {
    const node = document.createElementNS(SVG_NS, name);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    if (parent) parent.appendChild(node);
    return node;
  }

  // Position of step i on the path. Rows go left-to-right, then right-to-left,
  // climbing upward like a switchback trail.
  function makeLayout(total) {
    const rows = Math.ceil((total + 1) / PER_ROW);
    const height = TOP + (rows - 1) * ROW_GAP + BOTTOM;
    const pos = (i) => {
      const row = Math.floor(i / PER_ROW);
      let col = i % PER_ROW;
      if (row % 2 === 1) col = PER_ROW - 1 - col;
      const x = 46 + col * ((WIDTH - 92) / (PER_ROW - 1));
      const wobble = (col % 2 === 0 ? 8 : -8) * (row % 2 === 0 ? 1 : -1);
      const y = height - BOTTOM - row * ROW_GAP + wobble;
      return [x, y];
    };
    return { height, pos };
  }

  // Smooth curve segments through the points (Catmull-Rom converted to Bezier).
  function curveSegments(points) {
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      segs.push(`C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`);
    }
    return segs;
  }

  function drawLantern(svg, x, y, task, state) {
    const g = el('g', { class: `lantern ${state}`, transform: `translate(${x} ${y})` }, svg);
    const inner = el('g', { class: 'l-inner' }, g);
    el('circle', { class: 'glow', r: 24, fill: 'url(#ltw-glow)' }, inner);
    el('line', { class: 'hook', x1: 0, y1: -19, x2: 0, y2: -15 }, inner);
    el('rect', { class: 'cap', x: -6, y: -15, width: 12, height: 3, rx: 1 }, inner);
    el('rect', { class: 'body', x: -8, y: -12, width: 16, height: 20, rx: 5 }, inner);
    el('rect', { class: 'base', x: -6, y: 8, width: 12, height: 3, rx: 1 }, inner);
    const num = el('text', { class: 'num', y: 26 }, g);
    num.textContent = task.day;
    const title = el('title', {}, g);
    title.textContent = `Day ${task.day}: ${task.text}`;
  }

  window.LTW_drawPath = function (container, tasks, options) {
    const opts = options || {};
    const total = tasks.length;
    const litCount = tasks.filter((t) => t.doneOn).length;
    const finished = litCount === total && total > 0;
    const { height, pos } = makeLayout(total);

    const lanterns = tasks.map((_, i) => pos(i));
    const flag = pos(total);
    const start = [14, lanterns[0][1] + 16];
    const route = [start, ...lanterns, flag];
    const segs = curveSegments(route);
    const startMove = `M ${start[0]} ${start[1]} `;

    container.innerHTML = '';
    const svg = el('svg', {
      viewBox: `0 0 ${WIDTH} ${height}`,
      role: 'img',
      'aria-label': `${litCount} of ${total} lanterns lit`
    });

    const defs = el('defs', {}, svg);
    const grad = el('radialGradient', { id: 'ltw-glow' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#ffc65c', 'stop-opacity': '0.55' }, grad);
    el('stop', { offset: '100%', 'stop-color': '#ffc65c', 'stop-opacity': '0' }, grad);

    el('path', { class: 'route', d: startMove + segs.join(' ') }, svg);
    const litSegs = finished ? segs.length : litCount;
    if (litSegs > 0) {
      el('path', { class: 'route-lit', d: startMove + segs.slice(0, litSegs).join(' ') }, svg);
    }

    const startLabel = el('text', { class: 'path-label', x: 6, y: start[1] + 18 }, svg);
    startLabel.textContent = 'Start';

    // Goal flag
    const fg = el('g', { class: `flag${finished ? ' won' : ''}`, transform: `translate(${flag[0]} ${flag[1]})` }, svg);
    el('line', { class: 'pole', x1: 0, y1: 12, x2: 0, y2: -26 }, fg);
    el('path', { class: 'cloth', d: 'M 0 -26 L 20 -19 L 0 -12 Z' }, fg);
    const goalLabel = el('text', { class: 'path-label', x: -14, y: 28 }, fg);
    goalLabel.textContent = 'Goal';

    let nextIndex = -1;
    tasks.forEach((task, i) => {
      let state = 'unlit';
      if (task.doneOn) state = 'lit';
      else if (nextIndex === -1) {
        nextIndex = i;
        // Started with a tiny version: glimmers until the full task is done.
        state = task.tinyDays && task.tinyDays.length ? 'glimmer' : 'next';
      }
      if (i === opts.justLit) state += ' just';
      drawLantern(svg, lanterns[i][0], lanterns[i][1], task, state);
    });

    container.appendChild(svg);

    // Scroll so the current lantern is in view on long plans.
    const focusIndex = nextIndex === -1 ? total - 1 : nextIndex;
    const focusY = focusIndex >= 0 ? lanterns[focusIndex][1] : height;
    requestAnimationFrame(() => {
      const scale = svg.getBoundingClientRect().height / height || 1;
      container.scrollTop = Math.max(0, focusY * scale - container.clientHeight / 2);
    });
  };
})();
