/*
  // メイプルの装備ツールチップの切り出し用
  // とりあえず枠線から判定し、余分な候補を除外せずに範囲のリストを返すだけ
  
  // 装備ツールチップかどうかの正確な判定
  // 取得した範囲でクロップして、文字などで追加で判定して絞る
  // たとえば戦闘力増加量の文字はMSPゴシック 12px #85919F
  
  // 利用例: const result = DetectTooltips.run(imageData.data, width, height, options);
  // result.rects / tops / bots / lefts / rights / log を返す。
  // 検出コア。DetectTooltips.run(d, W, H, options) で判定する。d: RGBA配列, W,H: サイズ
  // o.sides: [上,下,左,右] の配列。各要素 { a:[r,g,b], tolA, b:[r,g,b], tolB }
  //   a/tolA: 外枠の色と許容差、 b/tolB: 内枠の色と許容差 (許容差はRGB空間のユークリッド距離)
  // o.peak: 内枠が本体(さらに内側)より明るい量, o.minLen: 最小辺長, o.cover: 辺として認める最小の連続率(0?1), o.debug: 左右の辺候補も返す
  //
  // 枠の構造(外→内): 外枠(1px) → 内枠(1px) → 本体
  //   上辺: 外枠が行y、内枠が行y+1   下辺: 外枠が行y、内枠が行y-1
  //   左辺: 外枠が列x、内枠が列x+1   右辺: 外枠が列x、内枠が列x-1
  // 辺ごとに外枠色・内枠色・許容差を別々に判定する。

  // src: Canvas;
  // sctx: src.getContext('2d', { willReadFrequently: true });
  // キャプチャの場合はCanvasの縦横をキャプチャに合わせて描画
    const W = vid.videoWidth, H = vid.videoHeight;
    if (src.width !== W || src.height !== H) { src.width = ov.width = W; src.height = ov.height = H; }
    sctx.drawImage(vid, 0, 0);
  
  const W = src.width, H = src.height;
  const d = sctx.getImageData(0, 0, W, H).data;
  const sides = ['top', 'bottom', 'left', 'right'].map(k => ({
    a: [35, 43, 52], // 外枠の色(共通)
    b: (k == "top" ? [108, 134, 147] : [71, 82, 90]), // 内枠の色(topのみ異なる)
    tolA: 80, // 閾値
    tolB: 50,
  }));
  const peak = 5;
  const minLen = 200;
  const cover = 80 / 100;
  const debug = false;
  const res = DetectTooltips.run(d, W, H, {sides, peak, minLen, cover, debug});
  console.log(res.rects); // rects.x, y, w, h
*/

class DetectTooltips {
  static defaultOptions = {
    sides: ['top', 'bottom', 'left', 'right'].map(k => ({
      a: [35, 43, 52], // 外枠の色(共通)
      b: (k == "top" ? [108, 134, 147] : [71, 82, 90]), // 内枠の色(topのみ異なる)
      tolA: 80, // 閾値
      tolB: 80,
    })),
    peak: 5,
    minLen: 200,
    cover: 80 / 100,
    debug: false,
    overlapType: "pixel", // 上辺と下辺のペアをx軸上の重なりで判定する。type: "pixel" or "percent"
    overlapThrethold: 1,
  };
  static run(d, W, H, o = {}) {
    o = {...this.defaultOptions, ...o};
    const MINLEN = o.minLen, GAP = 2, MINH = 20, CUT = 10; // CUT: 角の欠け・ずれの許容px
    const N = W * H, W4 = W * 4;
    const BIT_TOP = 1, BIT_BOT = 2, BIT_LEFT = 4, BIT_RIGHT = 8;
    const peak3 = o.peak * 3, MINSTEP3 = 8 * 3;
    const aR = [], aG = [], aB = [], tA2 = [], bR = [], bG = [], bB = [], tB2 = [];
    o.sides.forEach(s => {
      aR.push(s.a[0]); aG.push(s.a[1]); aB.push(s.a[2]); tA2.push(s.tolA * s.tolA);
      bR.push(s.b[0]); bG.push(s.b[1]); bB.push(s.b[2]); tB2.push(s.tolB * s.tolB);
    });
    const sameA = [1, 2, 3].every(k => aR[k] === aR[0] && aG[k] === aG[0] && aB[k] === aB[0] && tA2[k] === tA2[0]);
    const off = [W4, -W4, 4, -4];   // 各辺で「内側」に向かうバイトオフセット(上辺は下へ、下辺は上へ、左辺は右へ、右辺は左へ)

    // 1) 全画素を1回走査。各辺について 外枠色の画素 p → 内枠色の画素 q1(p より明るい) → 本体 q2(q1 より peak 以上暗い)
    //    の断面になっていればビットを立てる
    const bits = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0, i = y * W, p = i * 4; x < W; x++, i++, p += 4) {
        const r = d[p], g = d[p + 1], b = d[p + 2];
        if (sameA) {   // 4辺とも外枠の設定が同じなら、外枠色の判定は1回で済ませる(速度優先)
          const dr0 = r - aR[0], dg0 = g - aG[0], db0 = b - aB[0];
          if (dr0 * dr0 + dg0 * dg0 + db0 * db0 > tA2[0]) continue;
        }
        let m = 0;
        for (let k = 0; k < 4; k++) {
          let dr, dg, db;
          if (!sameA) {
            dr = r - aR[k]; dg = g - aG[k]; db = b - aB[k];
            if (dr * dr + dg * dg + db * db > tA2[k]) continue;
          }
          // 画像の端にある枠線も扱えるよう、内側へ2画素ぶんが画像内にある辺だけ調べる
          if (k === 0 ? y > H - 3 : k === 1 ? y < 2 : k === 2 ? x > W - 3 : x < 2) continue;
          const q1 = p + off[k], q2 = q1 + off[k];
          dr = d[q1] - bR[k]; dg = d[q1 + 1] - bG[k]; db = d[q1 + 2] - bB[k];
          if (dr * dr + dg * dg + db * db > tB2[k]) continue;
          const s1 = d[q1] + d[q1 + 1] + d[q1 + 2];
          if (s1 - (r + g + b) >= MINSTEP3 && s1 - (d[q2] + d[q2 + 1] + d[q2 + 2]) >= peak3) m |= 1 << k;
        }
        bits[i] = m;
      }
    }

    // 2) 辺の候補 = 同じ向きのビットが(小さな途切れを許して)直線状に続いたもの
    function rowRuns(bit) {
      const runs = [];
      for (let y = 0; y < H; y++) {
        const row = y * W;
        let s = -1, last = -1;
        for (let x = 0; x <= W; x++) {
          if (x < W && (bits[row + x] & bit)) { if (s < 0) s = x; last = x; }
          else if (s >= 0 && (x >= W || x - last > GAP)) {
            if (last - s + 1 >= MINLEN) runs.push({ y, s, e: last });
            s = -1;
          }
        }
      }
      return runs;
    }
    function colRuns(bit) {   // 表示専用(デバッグ時のみ)
      const runs = [];
      for (let x = 0; x < W; x++) {
        let s = -1, last = -1;
        for (let y = 0; y <= H; y++) {
          if (y < H && (bits[y * W + x] & bit)) { if (s < 0) s = y; last = y; }
          else if (s >= 0 && (y >= H || y - last > GAP)) {
            if (last - s + 1 >= MINLEN) runs.push({ x, s, e: last });
            s = -1;
          }
        }
      }
      return runs;
    }
    const tops = rowRuns(BIT_TOP), bots = rowRuns(BIT_BOT);
    const lefts = o.debug ? colRuns(BIT_LEFT) : [], rights = o.debug ? colRuns(BIT_RIGHT) : [];

    // 縦の辺: x列の y0..y1 のうち bit が立っている割合 / 横の辺: y行の x0..x1 のうち bit が立っている割合
    function colFrac(x, y0, y1, bit) {
      let c = 0;
      for (let y = y0; y <= y1; y++) if (bits[y * W + x] & bit) c++;
      return c / (y1 - y0 + 1);
    }
    function rowFrac(y, x0, x1, bit) {
      let c = 0; const row = y * W;
      for (let x = x0; x <= x1; x++) if (bits[row + x] & bit) c++;
      return c / (x1 - x0 + 1);
    }
    // a..b の範囲で縦の辺が最もよく揃う列と、その連続率を返す(左辺は最も外側のx、右辺は最も外側のxを優先)
    function findSide(y0, y1, a, b, bit, leftmost) {
      const ya = y0 + CUT, yb = y1 - CUT;
      let best = -1, bestScore = -1;
      if (yb <= ya) return { x: best, score: 0 };
      a = Math.max(a, 0); b = Math.min(b, W - 1);
      if (leftmost) { for (let x = a; x <= b; x++) { const f = colFrac(x, ya, yb, bit); if (f > bestScore) { bestScore = f; best = x; } } }
      else          { for (let x = b; x >= a; x--) { const f = colFrac(x, ya, yb, bit); if (f > bestScore) { bestScore = f; best = x; } } }
      return { x: best, score: Math.max(bestScore, 0) };
    }

    // 3) 上辺候補ごとに、対応しそうな下辺候補とペアにして四角形として検証する。
    //    不採用の理由は log に残す(なぜ矩形にならないかの確認用)
    const need = o.cover, pct = v => Math.round(v * 100) + '%';
    const candidates = [], log = [];
    // 矩形の角付近だけを追加評価する。辺検出そのものは変えず、上辺候補の選択に使う。
    function sideEndSupport(x, y, bit, from, to) {
      const y0 = Math.max(0, from), y1 = Math.min(H - 1, to);
      if (y1 < y0) return 0;
      return colFrac(x, y0, y1, bit);
    }
    for (const T of tops) {
      const head = `上辺 y=${T.y} x=${T.s}-${T.e}: `;
      const why = [];
      let found = false;
      let foundtag = "";
      for (const B of bots) {
        if (B.y < T.y + MINH) continue;
        // 上辺と下辺が左右方向にある程度重なっている場合だけ対象にする(途切れて短くなった候補同士でも組めるように、端の一致は要求しない)
        const type = o.overlapType;
        const threthold = o.overlapThrethold;
        if (type === "percent"){
          // 短い方のX％以上が重なっている
          if (Math.min(T.e, B.e) - Math.max(T.s, B.s) < threthold * Math.min(T.e - T.s, B.e - B.s)) continue;
        } else if (type === "pixel"){
          if (Math.min(T.e, B.e) - Math.max(T.s, B.s) < threthold) continue;
        } else {
          // 無条件
        }
        const L = findSide(T.y, B.y, Math.min(T.s, B.s) - CUT, Math.max(T.s, B.s) + 1, BIT_LEFT, true);
        const R = findSide(T.y, B.y, Math.min(T.e, B.e) - 1, Math.max(T.e, B.e) + CUT, BIT_RIGHT, false);
        const tag = `下辺 y=${B.y} x=${B.s}-${B.e} / 左辺 x=${L.x} / 右辺 x=${R.x} / `;
        if (L.score < need) { why.push(tag + `左辺の連続率 ${pct(L.score)} (必要 ${pct(need)})`); continue; }
        if (R.score < need) { why.push(tag + `右辺の連続率 ${pct(R.score)} (必要 ${pct(need)})`); continue; }
        const xl = L.x, xr = R.x;
        const ft = rowFrac(T.y, xl + CUT, xr - CUT, BIT_TOP);
        const fb = rowFrac(B.y, xl + CUT, xr - CUT, BIT_BOT);
        if (xr - xl < MINLEN) { why.push(tag + '幅が最小辺長未満'); continue; }
        if (ft < need) { why.push(tag + `上辺の連続率 ${pct(ft)} (必要 ${pct(need)}) 途中で途切れている`); continue; }
        if (fb < need) { why.push(tag + `下辺の連続率 ${pct(fb)} (必要 ${pct(need)}) 途中で途切れている`); continue; }
        // 上辺の外側にも左右辺が続く候補は、枠の内側にある線として除外する。
        if (T.y >= 12 && colFrac(xl, T.y - 12, T.y - 7, BIT_LEFT) >= need && colFrac(xr, T.y - 12, T.y - 7, BIT_RIGHT) >= need) { why.push(tag + '上辺の外側にも左右の辺が続いている(内側の線)'); continue; }
        if (B.y + 12 < H && colFrac(xl, B.y + 7, B.y + 12, BIT_LEFT) >= need && colFrac(xr, B.y + 7, B.y + 12, BIT_RIGHT) >= need) { why.push(tag + '下辺の外側にも左右の辺が続いている(内側の線)'); continue; }

        // スコア: 4辺の連続率を基本点とし、上辺端点と左右辺の位置・上端の一致を加味する。
        // 左右辺が上辺より上まで続いている候補は減点し、角付近で左右辺が始まる候補を優先。
        const near = Math.max(3, Math.min(CUT, 8));
        const leftBelow = sideEndSupport(xl, T.y, BIT_LEFT, T.y, T.y + near);
        const rightBelow = sideEndSupport(xr, T.y, BIT_RIGHT, T.y, T.y + near);
        const leftAbove = sideEndSupport(xl, T.y, BIT_LEFT, T.y - near, T.y - 1);
        const rightAbove = sideEndSupport(xr, T.y, BIT_RIGHT, T.y - near, T.y - 1);
        const endpointError = Math.abs(T.s - xl) + Math.abs(T.e - xr);
        const score = 100 * (ft + fb + L.score + R.score)
          + 18 * (leftBelow + rightBelow)
          - 24 * (leftAbove + rightAbove)
          - 1.5 * endpointError;
        candidates.push({ x: xl, y: T.y, w: xr - xl + 1, h: B.y - T.y + 1, score, top: T });
        found = true;
        foundtag = tag;
      }
      if (!found && !why.length) why.push('組める下辺候補がない');
      let logtext = head;
      if (found) logtext +=  'found! '+ foundtag;
      if (why.length > 0) logtext += ["", ...why.slice(0, 3)].join("\n\t");
      log.push(logtext);
    }

    // 高スコア順に採用する。これにより、同じ下辺・左右辺に複数の上辺が対応する場合も
    // 最初に見つかった上辺ではなく、四隅の整合性が最も高い候補が優先される。
    candidates.sort((a, b) => b.score - a.score);
    const rects = [];
    for (const c of candidates) {
      // 既に採用した矩形の内側にある上辺候補は重複として除外する。
      if (rects.some(r =>
        (c.y >= r.y && c.y < r.y + r.h && c.top.s >= r.x && c.top.e < r.x + r.w) ||
        (r.y >= c.y && r.y < c.y + c.h && r.x >= c.x && r.x + r.w - 1 <= c.x + c.w - 1)
      )) continue;
      rects.push({ x: c.x, y: c.y, w: c.w, h: c.h });
    }
    return { rects, tops, bots, lefts, rights, log };
  }
}
// ==CORE-END==