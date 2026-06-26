/* =============================================================
   SNS Foncier — Animation Login Professionnelle v3
   Thème : Bleu nuit · Cadastre · GPS · Glassmorphism
   Cible : 60 FPS, fluide, non distrayant
============================================================= */
(function () {
  'use strict';

  /* ── Palette ────────────────────────────────────────────── */
  var C = {
    bg1  : '#04091a',
    bg2  : '#071328',
    bg3  : '#050e20',
    line : 'rgba(80,140,255,',
    node : 'rgba(100,210,255,',
    flow : 'rgba(130,220,255,',
    glow : 'rgba(60,160,255,',
    star : 'rgba(180,210,255,',
    grid : 'rgba(50,100,200,',
    acc  : 'rgba(80,255,180,',   // accent vert menthe (coord labels)
  };

  /* ── Patch DOM : retire les emojis + remplace titre SNS ── */
  function removeEmojis(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      var v = node.nodeValue;
      if (!v) return;
      var c = v
        .replace(/([\uD800-\uDBFF][\uDC00-\uDFFF])/g, '')  // surrogates (U+10000+)
        .replace(/[☀-➿]/g, '')                    // misc symbols (☀ ★ ✅ ❌ ⚠ …)
        .replace(/[⬀-⯿]/g, '')                    // misc arrows (⭐ …)
        .replace(/[︀-️‍]/g, '');             // variation selectors + ZWJ
      if (c !== v) node.nodeValue = c;
    } else if (node.nodeType === 1 &&
               node.tagName !== 'SCRIPT' &&
               node.tagName !== 'STYLE'  &&
               node.tagName !== 'CANVAS') {
      for (var i = 0; i < node.childNodes.length; i++) {
        removeEmojis(node.childNodes[i]);
      }
    }
  }

  function applyLoginBranding() {
    var w = document.createTreeWalker(
      document.body, NodeFilter.SHOW_TEXT, null, false
    );
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeValue.trim() === 'SNS') {
        n.nodeValue = 'BIENVENUE!';
        var el = n.parentElement;
        if (el) {
          // Adapte le conteneur au texte plus long tout en gardant le fond vert
          el.style.setProperty('width', 'auto', 'important');
          el.style.setProperty('height', 'auto', 'important');
          el.style.setProperty('min-width', 'unset', 'important');
          el.style.setProperty('padding', '4px 14px', 'important');
          el.style.setProperty('border-radius', '6px', 'important');
          el.style.setProperty('white-space', 'nowrap', 'important');
          el.style.setProperty('display', 'inline-block', 'important');
          el.style.setProperty('line-height', '1.5', 'important');
          el.style.setProperty('font-size', '13px', 'important');
          el.style.setProperty('font-weight', '700', 'important');
          el.style.setProperty('letter-spacing', '0.5px', 'important');
        }
        break;
      }
    }
  }

  var _patchObsActive = false;
  function applyPatches() {
    removeEmojis(document.body);
    applyLoginBranding();
    if (!_patchObsActive) {
      _patchObsActive = true;
      var pObs = new MutationObserver(function(muts) {
        muts.forEach(function(m) {
          m.addedNodes.forEach(removeEmojis);
          if (m.type === 'characterData') removeEmojis(m.target);
        });
        applyLoginBranding();
      });
      pObs.observe(document.body, {
        childList: true, subtree: true, characterData: true
      });
    }
  }

  /* ── Injection dans le DOM ──────────────────────────────── */
  function tryInject() {
    var bg = document.querySelector(
      'div[style*="min-height: 100vh"][style*="linear-gradient(135deg"]'
    );
    if (!bg) { setTimeout(tryInject, 300); return; }
    if (bg.dataset.v3) return;
    bg.dataset.v3 = '1';
    run(bg);
    applyPatches();

    /* re-détecter après navigation React */
    new MutationObserver(function () {
      var next = document.querySelector(
        'div[style*="min-height: 100vh"][style*="linear-gradient(135deg"]'
      );
      if (next && !next.dataset.v3) { next.dataset.v3 = '1'; run(next); applyPatches(); }
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ══════════════════════════════════════════════════════════
     MOTEUR PRINCIPAL
  ══════════════════════════════════════════════════════════ */
  function run(wrap) {
    /* canvas */
    var cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;';
    wrap.insertBefore(cv, wrap.firstChild);
    var ctx = cv.getContext('2d');
    var W, H;

    function resize() {
      W = cv.width  = wrap.offsetWidth  || innerWidth;
      H = cv.height = wrap.offsetHeight || innerHeight;
    }
    resize();
    addEventListener('resize', resize);

    /* ── Fond dégradé bleu nuit ─────────────────────────── */
    function drawBg() {
      var g = ctx.createLinearGradient(0, 0, W * 0.6, H);
      g.addColorStop(0,   C.bg1);
      g.addColorStop(0.5, C.bg2);
      g.addColorStop(1,   C.bg3);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    /* ── Étoiles de fond (statiques, initialisées une seule fois) ── */
    var stars = [];
    (function () {
      for (var i = 0; i < 140; i++) {
        stars.push({
          x: Math.random(),
          y: Math.random(),
          r: 0.4 + Math.random() * 0.8,
          a: 0.2 + Math.random() * 0.5,
          ph: Math.random() * Math.PI * 2,
          sp: 0.0005 + Math.random() * 0.001
        });
      }
    })();

    function drawStars(t) {
      stars.forEach(function (s) {
        var a = s.a * (0.7 + 0.3 * Math.sin(t * s.sp + s.ph));
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283);
        ctx.fillStyle = C.star + a + ')';
        ctx.fill();
      });
    }

    /* ── Grille cadastrale (lignes qui se dessinent lentement) ── */
    /* On génère une grille irrégulière style plan cadastral       */
    var cadLines = [];

    (function () {
      var cols  = 9, rows = 7;
      var xStep = 1 / (cols - 1), yStep = 1 / (rows - 1);
      var jit   = 0.04; // perturbation pour look naturel

      function rj() { return (Math.random() - 0.5) * jit; }

      /* Points de grille */
      var pts = [];
      for (var r = 0; r < rows; r++) {
        pts[r] = [];
        for (var c = 0; c < cols; c++) {
          pts[r][c] = {
            x: c * xStep + (c > 0 && c < cols-1 ? rj() : 0),
            y: r * yStep + (r > 0 && r < rows-1 ? rj() : 0)
          };
        }
      }

      var delay = 0;
      var DUR   = 3.5; // secondes par ligne

      /* Lignes horizontales */
      for (var r2 = 0; r2 < rows; r2++) {
        for (var c2 = 0; c2 < cols - 1; c2++) {
          cadLines.push({
            x1: pts[r2][c2].x,   y1: pts[r2][c2].y,
            x2: pts[r2][c2+1].x, y2: pts[r2][c2+1].y,
            progress: 0, delay: delay, dur: DUR,
            alpha: 0.12 + Math.random() * 0.12,
            w: 0.6 + Math.random() * 0.4
          });
          delay += 0.18;
        }
      }
      /* Lignes verticales */
      for (var c3 = 0; c3 < cols; c3++) {
        for (var r3 = 0; r3 < rows - 1; r3++) {
          cadLines.push({
            x1: pts[r3][c3].x,   y1: pts[r3][c3].y,
            x2: pts[r3+1][c3].x, y2: pts[r3+1][c3].y,
            progress: 0, delay: delay, dur: DUR,
            alpha: 0.10 + Math.random() * 0.10,
            w: 0.5 + Math.random() * 0.4
          });
          delay += 0.22;
        }
      }
      /* Quelques diagonales (limites obliques) */
      var diags = [
        [pts[1][1], pts[2][3]], [pts[3][5], pts[4][7]],
        [pts[2][0], pts[4][2]], [pts[0][4], pts[2][6]],
        [pts[5][2], pts[6][4]], [pts[1][6], pts[3][8]],
      ];
      diags.forEach(function (d) {
        cadLines.push({
          x1: d[0].x, y1: d[0].y, x2: d[1].x, y2: d[1].y,
          progress: 0, delay: delay, dur: DUR * 1.4,
          alpha: 0.08 + Math.random() * 0.08, w: 0.6
        });
        delay += 0.3;
      });
    })();

    function drawCadastre(sec) {
      cadLines.forEach(function (l) {
        var elapsed = sec - l.delay;
        if (elapsed <= 0) return;
        l.progress = Math.min(1, elapsed / l.dur);

        var x1 = l.x1 * W, y1 = l.y1 * H;
        var x2 = l.x1 * W + (l.x2 - l.x1) * W * l.progress;
        var y2 = l.y1 * H + (l.y2 - l.y1) * H * l.progress;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = C.grid + l.alpha + ')';
        ctx.lineWidth   = l.w;
        ctx.stroke();
      });
    }

    /* ── Nœuds GPS ──────────────────────────────────────── */
    var nodes = [
      { x:0.12, y:0.18, label:'3°52\'14"N 11°31\'07"E', delay:2.0 },
      { x:0.30, y:0.08, label:'TF-2847 · 320 m²',       delay:3.2 },
      { x:0.55, y:0.12, label:'3°48\'33"N 11°29\'52"E', delay:4.1 },
      { x:0.78, y:0.20, label:'TF-1193 · 580 m²',       delay:5.0 },
      { x:0.92, y:0.10, label:'REF: SN-2024-047',        delay:5.8 },
      { x:0.08, y:0.45, label:'TF-0721 · 275 m²',       delay:3.5 },
      { x:0.22, y:0.60, label:'4°03\'18"N  9°42\'05"E', delay:6.2 },
      { x:0.45, y:0.72, label:'TF-4412 · 740 m²',       delay:7.0 },
      { x:0.70, y:0.55, label:'3°55\'41"N 11°30\'18"E', delay:4.8 },
      { x:0.88, y:0.48, label:'TF-5507 · 360 m²',       delay:6.5 },
      { x:0.15, y:0.85, label:'TF-0934 · 195 m²',       delay:8.0 },
      { x:0.60, y:0.88, label:'3°49\'02"N 11°31\'55"E', delay:7.5 },
      { x:0.85, y:0.80, label:'TF-2201 · 490 m²',       delay:8.8 },
      { x:0.40, y:0.40, label:'POINT GÉODÉSIQUE',        delay:9.5 },
    ];

    /* Connexions entre nœuds */
    var conns = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [2,8],[3,9],[8,9],
      [5,10],[10,6],[7,11],[11,12],
      [1,13],[13,8],[13,7],
    ];

    /* Particules qui glissent le long des connexions */
    var flowParts = [];
    conns.forEach(function (c, i) {
      flowParts.push({
        conn: i, t: Math.random(),
        speed: 0.0003 + Math.random() * 0.0002,
        alpha: 0.5 + Math.random() * 0.5
      });
    });

    function drawConnections(sec) {
      conns.forEach(function (c, i) {
        var a = nodes[c[0]], b = nodes[c[1]];
        var delayA = nodes[c[0]].delay + 0.5;
        var elapsed = sec - delayA;
        if (elapsed <= 0) return;
        var prog = Math.min(1, elapsed / 1.8);

        var x1 = a.x*W, y1 = a.y*H;
        var x2 = a.x*W + (b.x-a.x)*W*prog;
        var y2 = a.y*H + (b.y-a.y)*H*prog;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = C.line + '0.18)';
        ctx.lineWidth   = 0.8;
        ctx.stroke();
      });
    }

    function drawNodes(sec, t) {
      nodes.forEach(function (n) {
        var elapsed = sec - n.delay;
        if (elapsed <= 0) return;
        var appear  = Math.min(1, elapsed / 0.6);
        var pulse   = 0.6 + 0.4 * Math.sin(t * 0.002 + n.x * 10);
        var x = n.x * W, y = n.y * H;

        /* Halo externe pulsant */
        var haloR = 14 + 6 * pulse;
        var halo  = ctx.createRadialGradient(x,y,0, x,y,haloR);
        halo.addColorStop(0,   C.glow + (0.25 * appear * pulse) + ')');
        halo.addColorStop(1,   C.glow + '0)');
        ctx.beginPath(); ctx.arc(x, y, haloR, 0, 6.283);
        ctx.fillStyle = halo; ctx.fill();

        /* Point central */
        ctx.beginPath(); ctx.arc(x, y, 3 * appear, 0, 6.283);
        ctx.fillStyle = C.node + appear + ')'; ctx.fill();

        /* Anneau */
        ctx.beginPath(); ctx.arc(x, y, 5.5 * appear, 0, 6.283);
        ctx.strokeStyle = C.node + (0.7 * appear) + ')';
        ctx.lineWidth   = 1.2; ctx.stroke();

        /* Label (apparaît après le nœud) */
        if (elapsed > 1.0) {
          var la = Math.min(1, (elapsed - 1.0) / 0.8) * 0.7;
          ctx.font      = '9px "Courier New", monospace';
          ctx.fillStyle = C.acc + la + ')';
          var lx = x + 10, ly = y - 8;
          if (n.x > 0.75) lx = x - ctx.measureText(n.label).width - 10;
          if (n.y < 0.15) ly = y + 18;
          ctx.fillText(n.label, lx, ly);
        }
      });
    }

    function drawFlowParticles(sec, t) {
      flowParts.forEach(function (fp) {
        var c    = conns[fp.conn];
        var delA = nodes[c[0]].delay + 0.5;
        if (sec < delA + 1.8) return;

        fp.t += fp.speed;
        if (fp.t > 1) fp.t -= 1;

        var a = nodes[c[0]], b = nodes[c[1]];
        var x = (a.x + (b.x - a.x) * fp.t) * W;
        var y = (a.y + (b.y - a.y) * fp.t) * H;

        var grd = ctx.createRadialGradient(x,y,0, x,y,5);
        grd.addColorStop(0, C.flow + fp.alpha + ')');
        grd.addColorStop(1, C.flow + '0)');
        ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.283);
        ctx.fillStyle = grd; ctx.fill();
      });
    }

    /* ── HUD minimaliste (bas-gauche) ───────────────────── */
    var hudLines = [
      '▸ SYSTÈME CADASTRAL EN LIGNE',
      '▸ GPS RTCM 3.3 · PRÉCISION ±2cm',
      '▸ PROJECTION : UTM 32N / WGS 84',
      '▸ POINTS ACTIFS : 1 247',
    ];

    function drawHUD(sec) {
      var px = 20, py = H - 22 - (hudLines.length - 1) * 16;
      ctx.font      = '9.5px "Courier New", monospace';
      hudLines.forEach(function (line, i) {
        var delay   = 8 + i * 1.5;
        var elapsed = sec - delay;
        if (elapsed <= 0) return;
        var chars   = Math.floor(elapsed * 22);
        var shown   = line.substring(0, chars);
        var a       = Math.min(1, elapsed / 0.5) * 0.5;
        ctx.fillStyle = C.acc + a + ')';
        ctx.fillText(shown + (chars < line.length ? '█' : ''), px, py + i * 16);
      });
    }

    /* ── Vignette (assombrit les bords) ─────────────────── */
    function drawVignette() {
      var g = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.9);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(2,5,20,0.65)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    /* ══════════════════════════════════════════════════════
       BOUCLE RAF
    ══════════════════════════════════════════════════════ */
    var alive = true, t0 = null;

    function frame(ts) {
      if (!alive || !document.contains(wrap)) { alive = false; return; }
      if (!t0) t0 = ts;
      var t   = ts - t0;          // ms depuis démarrage
      var sec = t / 1000;         // secondes

      ctx.clearRect(0, 0, W, H);
      drawBg();
      drawStars(t);
      drawCadastre(sec);
      drawConnections(sec);
      drawFlowParticles(sec, t);
      drawNodes(sec, t);
      drawHUD(sec);
      drawVignette();

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ── Démarrage ──────────────────────────────────────── */
  setTimeout(applyPatches, 100);   // retirer emojis dès le premier rendu
  setTimeout(tryInject, 500);

})();
