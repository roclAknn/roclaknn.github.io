/*
  // メイプルの装備ツールチップの切り出し用（曖昧判定）
  // とりあえず枠線から判定し、余分な候補を除外せずに範囲の候補リストを返すだけ
  
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
    b: (k == "top" ? [96, 120, 133] : [71, 82, 90]), // 内枠の色(topのみ異なる)
    tolA: 80, // 閾値
    tolB: 50,
  }));
  const peak = 5;
  const minLen = 200;
  const cover = 80 / 100;
  const debug = false;
  const res = DetectTooltips.run(d, W, H, {sides, peak, minLen, cover, debug});
  console.log(res.rects); // rects.x, y, w, h

  // 装備品以外
    const sides = ['top', 'bottom', 'left', 'right'].map(k => ({
      a: [36, 43, 52], // 外枠の色(共通)
      b: (k == "top" ? [83, 104, 116] : [70, 83, 91]), // 内枠の色(topのみ異なる)
    }));
  // 装備品
    const sides = ['top', 'bottom', 'left', 'right'].map(k => ({
      a: [35, 43, 52], // 外枠の色(共通)
      b: (k == "top" ? [83～108, 105～134, 119～147] : [71, 82, 90]), // 内枠の色(topのみ異なる)
    }));

      

*/

class DetectTooltips {
  static defaultOptions = {
    sides: ['top', 'bottom', 'left', 'right'].map((k, i) => ({
      a: [35, 43, 52], // 外枠の色(共通)
      b: (i == 0 ? [96, 120, 133] : [71, 82, 90]), // 内枠の色(topのみ異なる)
      tolA: [100, 100, 80, 80][i], // 閾値
      tolB: [100, 100, 80, 80][i],
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
    const MINLEN = o.minLen, GAP = 2, MINH = 100, CUT = 10; // CUT: 角の欠け・ずれの許容px
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

    // 1) 全画素を1回走査。各辺について 外枠色の画素 p → 内枠色の画素 q1 → 本体 q2(q1 より peak 以上暗い)
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


/*
  // 範囲がアイテムツールチップかどうかを判定する
  // 装備かどうかなど細分化は別判定
*/
class ItemTooltipChecker {
  static WIDTH = 120;
  static HEIGHT = 3;

  // RGB各チャンネルの許容差（個別設定）

  static defaultOptions = {
    topColor: [0x23, 0x29, 0x30],    // #232930
    bottomColor: [0x35, 0x42, 0x49], // #354249
    topTol: 20,
    bottomTol: 50,
  };

  /**
   * アイテムツールチップかどうかを判定する。
   * ツールチップ内のアイテム名下のセパレート線で判別
   * @param {Uint8ClampedArray|Uint8Array} src 元画像のRGBA配列
   * @param {number} srcW 元画像の幅
   * @param {number} srcH 元画像の高さ
   * @param {{x:number, y:number, w:number, h:number}} rect 探査対象の矩形（絶対座標）
   * @returns {boolean}
   */
  static run(src, srcW, srcH, rect, o = {}) {
    // rect内の相対座標 x:10～w+60, y:10～200
    // セパレータは左6pxから右-5pxまで伸びる縦3px線
    // カーソルと重なっている場合のために広めに探査
    // 枠線を誤判定しないようにy座標の開始位置も下げる

    o = {...this.defaultOptions, ...o};
    const x0 = Math.max(0, Math.ceil(rect.x + 10));
    const y0 = Math.max(0, Math.ceil(rect.y + 10));

    const x1 = Math.min(
      srcW,
      Math.floor(rect.x + Math.min(rect.w, this.WIDTH+61))
    );

    const y1 = Math.min(
      srcH,
      Math.floor(rect.y + Math.min(rect.h, 201))
    );

    // 20x3の矩形が収まる必要がある
    const maxX = x1 - this.WIDTH;
    const maxY = y1 - this.HEIGHT;

    if (maxX < x0 || maxY < y0) return false;

    const {topColor, bottomColor, topTol, bottomTol} = o;

    // RGB各チャンネルを比較
    const matches = (i, color, tolerance) => {
      const diff2s = color.map((cl, ii) => (src[i+ii] - cl) ** 2 );
      const tol2 = tolerance ** 2;
      return diff2s[0] + diff2s[1] + diff2s[2] <= tol2;
    };
    // 候補位置を走査
    for (let y = y0; y <= maxY; y++) {
      for (let x = x0; x <= maxX; x++) {
        let valid = true;

        // 上段：#232930
        let i = (y * srcW + x) * 4;

        for (let dx = 0; dx < this.WIDTH; dx++) {
          if (!matches(i + dx * 4, topColor, topTol)) {
            valid = false;
            break;
          }
        }

        if (!valid) continue;

        // 下2段：#354249
        for (let dy = 1; dy <= 2 && valid; dy++) {
          i = ((y + dy) * srcW + x) * 4;

          for (let dx = 0; dx < this.WIDTH; dx++) {
            if (!matches(i + dx * 4, bottomColor, bottomTol)) {
              valid = false;
              break;
            }
          }
        }

        if (valid) return true;
      }
    }

    return false;
  }
}


/*
  // 範囲が装備ツールチップであるか判定
  // 元画像＋ツールチップRectから文字探査して判定する
*/ 
class EquipmentTooltipChecker {
  static FONT = "ＭＳ Ｐゴシック";
  static PIXEL = 12;
  static COLOR = "#85919F";

  // クラス初期化時に生成し、以降は再利用
  // "戦闘力増加量"の文字にマウスが重なっている場合のために2文字判定
  static TEMPLATES = [
    createTextRGBA("戦", this.FONT, this.PIXEL, this.COLOR),
    createTextRGBA("量", this.FONT, this.PIXEL, this.COLOR),
  ];

  static defaultOptions = {
    colorTolerance: 12, // 色幅の許容範囲
    maxMismatchRate: 0.2, // ノイズなどによる不一致パターンの許容割合
    maxBorderColorRate: 0.08, // 文字の縁取り部分が文字色と一致するパターンの許容割合 
  };

  // rect: DetectTooltips.run() が返す矩形 {x, y, w, h}
  // true: 「戦」または「量」を検出
  static run(src, srcW, srcH, rect, o = {}) {
    o = {...this.defaultOptions, ...o};

    const area = {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: Math.min(rect.h, 200),
    };

    for (const template of this.TEMPLATES) {
      if (
        findTextRGBA(
          src, srcW, srcH,
          template, area, o,
        )
      ) {
        return true;
      }
    }

    return false;
  }
}

/**
 * 文字列をRGBAテンプレートに変換する汎用関数。
 * 文字の一致判定画素と、文字の外側1pxの縁取り画素を作成する。
 */
function createTextRGBA(text, font, pixel, color) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.font = `${pixel}px "${font}"`;
  ctx.textBaseline = "alphabetic";

  const metrics = ctx.measureText(text);
  const width = Math.max(1, Math.ceil(metrics.width) + 2);
  const height = pixel + 6;

  canvas.width = width;
  canvas.height = height;

  // canvasサイズ変更後に設定し直す
  ctx.font = `${pixel}px "${font}"`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.fillText(text, 1, pixel + 2);

  const data = ctx.getImageData(0, 0, width, height).data;
  const match = [];
  const mask = new Uint8Array(width * height);

  // 文字形状のマスク。アンチエイリアス部分も形状に含める
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] > 16) {
      mask[i] = 1;
    }
  }

  // 従来の一致判定画素：十分に不透明な画素だけを使用
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      const i = pos * 4;

      if (data[i + 3] >= 245) {
        match.push([
          x, y,
          data[i], data[i + 1], data[i + 2]
        ]);
      }
    }
  }

  // 文字色と同じ塗りつぶしを除外するために文字形状の外側1pxを抽出。
  // 8方向に隣接する文字形状の外側で、テンプレート画像内の画素だけを使う。
  const border = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;

      if (mask[pos]) continue;

      let adjacent = false;

      for (let dy = -1; dy <= 1 && !adjacent; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;

          const nx = x + dx;
          const ny = y + dy;

          if (
            nx >= 0 && nx < width &&
            ny >= 0 && ny < height &&
            mask[ny * width + nx]
          ) {
            adjacent = true;
            break;
          }
        }
      }

      if (adjacent) {
        border.push([x, y]);
      }
    }
  }

  return { width, height, match, border };
}


/**
 * RGBA配列から文字テンプレートを探査する汎用関数。
 *
 * src: 元画像のRGBA配列
 * srcW, srcH: 元画像の幅・高さ
 * template: createTextRGBA() の戻り値
 * rect: { x, y, w, h }。元画像上の絶対座標
 * options:
 *   colorTolerance: RGB各チャンネルの許容差
 *   maxMismatchRate: 文字画素の不一致許容率
 *   maxBorderColorRate: 縁取りに文字色が現れる割合の許容値
 *   minPoints: 文字画素の最低数
 */
function findTextRGBA(src, srcW, srcH, template, rect, options = {}) {
  const colorTolerance = options.colorTolerance ?? 18;
  const maxMismatchRate = options.maxMismatchRate ?? 0.12;
  const maxBorderColorRate = options.maxBorderColorRate ?? 0.08;
  const minPoints = options.minPoints ?? 5;

  const match = template.match;
  const border = template.border;

  if (match.length < minPoints || border.length === 0) {
    return false;
  }

  const x0 = Math.max(0, Math.ceil(rect.x));
  const y0 = Math.max(0, Math.ceil(rect.y));
  const x1 = Math.min(srcW, Math.floor(rect.x + rect.w));
  const y1 = Math.min(
    srcH,
    Math.floor(rect.y + Math.min(rect.h, 200))
  );

  const maxX = x1 - template.width;
  const maxY = y1 - template.height;

  if (maxX < x0 || maxY < y0) return false;

  const tol = colorTolerance;
  const maxMismatch = Math.floor(match.length * maxMismatchRate);
  const maxBorderColor = Math.floor(
    border.length * maxBorderColorRate
  );

  // 候補画素が指定色に近いか判定
  function isTargetColor(i) {
    return (
      Math.abs(src[i]     - 133) <= tol &&
      Math.abs(src[i + 1] - 145) <= tol &&
      Math.abs(src[i + 2] - 159) <= tol
    );
  }

  // 左上座標を走査。元画像のRGBA配列を直接参照する。
  for (let y = y0; y <= maxY; y++) {
    for (let x = x0; x <= maxX; x++) {
      const base = y * srcW + x;
      let mismatch = 0;

      // 1. 文字画素の一致判定（従来処理）
      for (let k = 0; k < match.length; k++) {
        const p = match[k];
        const i = (base + p[1] * srcW + p[0]) * 4;

        if (
          Math.abs(src[i]     - p[2]) > tol ||
          Math.abs(src[i + 1] - p[3]) > tol ||
          Math.abs(src[i + 2] - p[4]) > tol
        ) {
          mismatch++;
          if (mismatch > maxMismatch) break;
        }
      }

      if (mismatch > maxMismatch) continue;

      // 2. 文字の外側1pxが指定色ではないことを確認
      let borderColorCount = 0;

      for (let k = 0; k < border.length; k++) {
        const p = border[k];
        const i = (base + p[1] * srcW + p[0]) * 4;

        if (isTargetColor(i)) {
          borderColorCount++;
          if (borderColorCount > maxBorderColor) break;
        }
      }

      if (borderColorCount <= maxBorderColor) {
        return true;
      }
    }
  }

  return false;
}

