"use strict";
/* Lichter auf einer Kreisbahn mit Toon Shading – reines WebGL, keine Bibliotheken. */

(function () {
  const canvas = document.getElementById("gl");
  const errBox = document.getElementById("error");
  const hudShader = document.getElementById("hud-shader");
  const hudAngle = document.getElementById("hud-angle");

  function showError(msg) {
    console.error(msg);
    errBox.hidden = false;
    errBox.textContent = msg;
  }

  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) { showError("WebGL wird von diesem Browser nicht unterstützt."); return; }

  /* ---------- Shader ---------- */
  const VS = `
    attribute vec3 aPos;
    attribute vec3 aNormal;
    uniform mat4 uModel, uView, uProj;
    varying vec3 vPos;
    varying vec3 vNormal;
    void main() {
      vec4 world = uModel * vec4(aPos, 1.0);
      vPos = world.xyz;
      vNormal = mat3(uModel) * aNormal;   // nur Rotation + gleichmäßige Skalierung
      gl_Position = uProj * uView * world;
    }`;

  const FS = `
    precision highp float;
    varying vec3 vPos;
    varying vec3 vNormal;
    uniform vec3 uLightPos[2];
    uniform vec3 uLightCol[2];
    uniform vec3 uColor;
    uniform vec3 uCamPos;
    uniform float uToon;     // 1.0 = Toon-Shader
    uniform float uUnlit;    // 1.0 = unbeleuchtet (Lichtmarker)
    uniform float uOutline;  // 1.0 = Kontur erlaubt

    // Diffusen Anteil in harte Stufen zerlegen
    float quantize(float d) {
      if (d > 0.60) return 1.00;
      if (d > 0.25) return 0.60;
      if (d > 0.02) return 0.30;
      return 0.0;
    }

    void main() {
      if (uUnlit > 0.5) { gl_FragColor = vec4(uColor, 1.0); return; }

      vec3 N = normalize(vNormal);
      vec3 V = normalize(uCamPos - vPos);
      vec3 color = uColor * 0.20;               // Ambient

      for (int i = 0; i < 2; i++) {
        vec3 L = normalize(uLightPos[i] - vPos);
        vec3 H = normalize(L + V);
        float d = max(dot(N, L), 0.0);
        float s = (d > 0.0) ? pow(max(dot(N, H), 0.0), 48.0) : 0.0;
        vec3 lc = uLightCol[i];

        if (uToon > 0.5) {
          color += uColor * lc * quantize(d) * 0.85;
          color += lc * step(0.55, s) * 0.55;   // scharfer Glanzpunkt
        } else {
          color += uColor * lc * d * 0.85;
          color += lc * s * 0.45;
        }
      }

      if (uToon > 0.5 && uOutline > 0.5 && dot(N, V) < 0.28) {
        color = vec3(0.02);                     // Kontur / Silhouette
      }
      gl_FragColor = vec4(min(color, vec3(1.0)), 1.0);
    }`;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error("Shader-Fehler:\n" + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Link-Fehler:\n" + gl.getProgramInfoLog(prog));
    }
  } catch (e) { showError(e.message); return; }
  gl.useProgram(prog);

  const loc = {
    aPos: gl.getAttribLocation(prog, "aPos"),
    aNormal: gl.getAttribLocation(prog, "aNormal"),
  };
  ["uModel", "uView", "uProj", "uLightPos", "uLightCol", "uColor", "uCamPos", "uToon", "uUnlit", "uOutline"]
    .forEach(n => { loc[n] = gl.getUniformLocation(prog, n); });

  /* ---------- Matrizen (spaltenweise) ---------- */
  const M = {
    identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++) {
          let s = 0;
          for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
          o[c * 4 + r] = s;
        }
      return o;
    },
    translate(x, y, z) { const m = M.identity(); m[12] = x; m[13] = y; m[14] = z; return m; },
    scale(x, y, z) { const m = M.identity(); m[0] = x; m[5] = y; m[10] = z; return m; },
    rotY(a) { const m = M.identity(), c = Math.cos(a), s = Math.sin(a);
      m[0] = c; m[8] = s; m[2] = -s; m[10] = c; return m; },
    rotX(a) { const m = M.identity(), c = Math.cos(a), s = Math.sin(a);
      m[5] = c; m[9] = -s; m[6] = s; m[10] = c; return m; },
    perspective(fovy, aspect, n, f) {
      const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
      m[0] = t / aspect; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f);
      return m;
    },
    lookAt(e, c, u) {
      let zx = e[0]-c[0], zy = e[1]-c[1], zz = e[2]-c[2];
      let l = Math.hypot(zx, zy, zz); zx/=l; zy/=l; zz/=l;
      let xx = u[1]*zz - u[2]*zy, xy = u[2]*zx - u[0]*zz, xz = u[0]*zy - u[1]*zx;
      l = Math.hypot(xx, xy, xz); xx/=l; xy/=l; xz/=l;
      const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
      return new Float32Array([
        xx, yx, zx, 0,
        xy, yy, zy, 0,
        xz, yz, zz, 0,
        -(xx*e[0]+xy*e[1]+xz*e[2]), -(yx*e[0]+yy*e[1]+yz*e[2]), -(zx*e[0]+zy*e[1]+zz*e[2]), 1
      ]);
    }
  };

  /* ---------- Geometrie ---------- */
  function makeMesh(pos, nor, idx) {
    const pb = gl.createBuffer(), nb = gl.createBuffer(), ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, nb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nor), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    return { pb, nb, ib, count: idx.length };
  }

  function sphere(r, seg) {
    const p = [], n = [], i = [];
    for (let a = 0; a <= seg; a++) {
      const th = a * Math.PI / seg;
      for (let b = 0; b <= seg; b++) {
        const ph = b * 2 * Math.PI / seg;
        const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        p.push(r*x, r*y, r*z); n.push(x, y, z);
      }
    }
    for (let a = 0; a < seg; a++)
      for (let b = 0; b < seg; b++) {
        const f = a * (seg + 1) + b, s = f + seg + 1;
        i.push(f, s, f + 1, s, s + 1, f + 1);
      }
    return makeMesh(p, n, i);
  }

  function torus(R, r, seg, sides) {
    const p = [], n = [], i = [];
    for (let a = 0; a <= seg; a++) {
      const u = a * 2 * Math.PI / seg;
      for (let b = 0; b <= sides; b++) {
        const v = b * 2 * Math.PI / sides;
        const nx = Math.cos(v) * Math.cos(u), ny = Math.sin(v), nz = Math.cos(v) * Math.sin(u);
        p.push((R + r * Math.cos(v)) * Math.cos(u), r * ny, (R + r * Math.cos(v)) * Math.sin(u));
        n.push(nx, ny, nz);
      }
    }
    for (let a = 0; a < seg; a++)
      for (let b = 0; b < sides; b++) {
        const f = a * (sides + 1) + b, s = f + sides + 1;
        i.push(f, f + 1, s, s, f + 1, s + 1);
      }
    return makeMesh(p, n, i);
  }

  function cube() {
    const p = [], n = [], i = [];
    const faces = [
      [[1,0,0],[0,1,0],[0,0,1]], [[-1,0,0],[0,1,0],[0,0,-1]],
      [[0,1,0],[0,0,1],[1,0,0]], [[0,-1,0],[0,0,1],[-1,0,0]],
      [[0,0,1],[1,0,0],[0,1,0]], [[0,0,-1],[-1,0,0],[0,1,0]]
    ];
    faces.forEach((f, k) => {
      const [nn, u, v] = f;
      [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([a, b]) => {
        p.push(nn[0]+a*u[0]+b*v[0], nn[1]+a*u[1]+b*v[1], nn[2]+a*u[2]+b*v[2]);
        n.push(nn[0], nn[1], nn[2]);
      });
      const o = k * 4; i.push(o, o+1, o+2, o, o+2, o+3);
    });
    return makeMesh(p, n, i);
  }

  function plane(h) {
    return makeMesh([-h,0,-h, h,0,-h, h,0,h, -h,0,h], [0,1,0, 0,1,0, 0,1,0, 0,1,0], [0,2,1, 0,3,2]);
  }

  const meshes = {
    sphere: sphere(1, 40),
    cube: cube(),
    torus: torus(1, 0.38, 48, 24),
    floor: plane(9),
  };

  function drawMesh(mesh, model, color, opts) {
    opts = opts || {};
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pb);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nb);
    gl.enableVertexAttribArray(loc.aNormal);
    gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
    gl.uniformMatrix4fv(loc.uModel, false, model);
    gl.uniform3fv(loc.uColor, color);
    gl.uniform1f(loc.uUnlit, opts.unlit ? 1 : 0);
    gl.uniform1f(loc.uOutline, opts.noOutline ? 0 : 1);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  /* ---------- Zustand ---------- */
  const LIGHT_RADIUS = 5.5;
  const LIGHT_HEIGHT = 2.6;
  const LIGHT_STEP = 15 * Math.PI / 180;   // Schritt pro Tastendruck
  const lightColors = [[1.0, 0.82, 0.55], [0.45, 0.70, 1.0]];

  const state = { lightAngle: 0, steps: 0, toon: false };
  const cam = { yaw: 0.5, pitch: 0.45, dist: 13 };
  const camDefault = Object.assign({}, cam);

  function lightPositions() {
    return [0, 1].map(k => {
      const a = state.lightAngle + k * Math.PI;
      return [LIGHT_RADIUS * Math.cos(a), LIGHT_HEIGHT, LIGHT_RADIUS * Math.sin(a)];
    });
  }

  function updateHud() {
    hudShader.textContent = "Shader: " + (state.toon ? "Toon" : "Phong");
    hudAngle.textContent = "Lichtwinkel: " + ((state.steps * 15) % 360) + "°";
  }

  function moveLights() { state.lightAngle += LIGHT_STEP; state.steps++; updateHud(); }
  function toggleToon() { state.toon = !state.toon; updateHud(); }
  function resetCam() { Object.assign(cam, camDefault); }

  /* ---------- Eingabe ---------- */
  window.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();       // Shift spielt keine Rolle
    if (k === "l") { moveLights(); e.preventDefault(); }
    else if (k === "t") { toggleToon(); e.preventDefault(); }
    else if (k === "r") { resetCam(); }
  });
  document.getElementById("btn-light").addEventListener("click", () => { moveLights(); canvas.focus(); });
  document.getElementById("btn-toon").addEventListener("click", () => { toggleToon(); canvas.focus(); });
  document.getElementById("btn-reset").addEventListener("click", () => { resetCam(); canvas.focus(); });

  let drag = null;
  canvas.addEventListener("pointerdown", e => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.focus();
  });
  canvas.addEventListener("pointermove", e => {
    if (!drag) return;
    cam.yaw -= (e.clientX - drag.x) * 0.008;
    cam.pitch = Math.min(1.4, Math.max(0.05, cam.pitch + (e.clientY - drag.y) * 0.008));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    cam.dist = Math.min(25, Math.max(6, cam.dist * (1 + Math.sign(e.deltaY) * 0.08)));
  }, { passive: false });

  /* ---------- Rendern ---------- */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.05, 0.06, 0.09, 1);

  function frame(ms) {
    const t = ms * 0.001;
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const eye = [
      cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
      cam.dist * Math.sin(cam.pitch),
      cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw)
    ];
    const view = M.lookAt(eye, [0, 0.2, 0], [0, 1, 0]);
    const proj = M.perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
    const lp = lightPositions();

    gl.uniformMatrix4fv(loc.uView, false, view);
    gl.uniformMatrix4fv(loc.uProj, false, proj);
    gl.uniform3fv(loc.uCamPos, eye);
    gl.uniform3fv(loc.uLightPos, new Float32Array([...lp[0], ...lp[1]]));
    gl.uniform3fv(loc.uLightCol, new Float32Array([...lightColors[0], ...lightColors[1]]));
    gl.uniform1f(loc.uToon, state.toon ? 1 : 0);

    // Boden
    drawMesh(meshes.floor, M.translate(0, -1, 0), [0.55, 0.62, 0.50], { noOutline: true });
    // Kugel (rot)
    drawMesh(meshes.sphere, M.mul(M.translate(-3, 0, 0), M.scale(1, 1, 1)), [0.90, 0.20, 0.22]);
    // Würfel (grün), langsam rotierend
    drawMesh(meshes.cube, M.mul(M.translate(0, -0.1, 0), M.mul(M.rotY(t * 0.4), M.scale(0.9, 0.9, 0.9))),
      [0.25, 0.75, 0.35]);
    // Torus (gelb), liegend und rotierend
    drawMesh(meshes.torus, M.mul(M.translate(3, 0.0, 0), M.mul(M.rotY(t * 0.6), M.mul(M.rotX(Math.PI / 2.6), M.scale(0.85, 0.85, 0.85)))),
      [0.95, 0.75, 0.15]);

    // Lichtmarker und Bahn (unbeleuchtet)
    lp.forEach((p, k) => drawMesh(meshes.sphere, M.mul(M.translate(p[0], p[1], p[2]), M.scale(0.22, 0.22, 0.22)),
      lightColors[k], { unlit: true }));
    const ring = M.mul(M.translate(0, LIGHT_HEIGHT, 0), M.scale(LIGHT_RADIUS, 1, LIGHT_RADIUS));
    // Ring: Torus mit sehr kleinem Querschnitt; nur xz skaliert, Querschnitt bleibt dünn
    drawMesh(meshes.torus, M.mul(ring, M.scale(1, 0.03, 1)), [0.45, 0.48, 0.55], { unlit: true });

    requestAnimationFrame(frame);
  }

  updateHud();
  canvas.focus();
  requestAnimationFrame(frame);
})();
