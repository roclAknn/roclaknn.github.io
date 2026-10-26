/*
  // メイプルのアイテム・装備ツールチップのクロップ処理
  // #1 DetectTooltips.run() #とりあえず枠線から判定し、余分な候補を除外せずに範囲の候補リストを返すだけ
  // #2.1 EquipmentTooltipChecker.run() #ツールチップ候補に対して文字画像判定で装備か判定
  // #2.2 ItemTooltipChecker.run() #ツールチップ候補に対してアイコン枠線判定(1辺以上)でアイテムか判定(装備にもマッチする)

  // 汎用画像判定を提供
  // 汎用文字生成、文字判定処理を提供。ステータス数値のOCRなどに
*/

/*
  // ツールチップの枠線を検出→矩形を作れれば記録して返す
  // これだけだとほかのUIと干渉した誤検出を含む
  
  // 枠の構造(外→内): 外枠(1px) → 内枠(1px) → 本体
  //   上辺: 外枠が行y、内枠が行y+1   下辺: 外枠が行y、内枠が行y-1
  //   左辺: 外枠が列x、内枠が列x+1   右辺: 外枠が列x、内枠が列x-1
  // 辺ごとに外枠色・内枠色・許容差を別々に判定する。
  
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


  // 検出コア。DetectTooltips.run(d, W, H, options) で判定する。d: RGBA配列, W,H: サイズ
  // o.sides: [上,下,左,右] の配列。各要素 { a:[r,g,b], tolA, b:[r,g,b], tolB }
  //   a/tolA: 外枠の色と許容差、 b/tolB: 内枠の色と許容差 (許容差はRGB空間のユークリッド距離)
  // o.peak: 内枠が本体(さらに内側)より明るい量, o.minLen: 最小辺長, o.cover: 辺として認める最小の連続率(0?1), o.debug: 左右の辺候補も返す
  //

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
  
*/

class DetectTooltips {
  static defaultOptions = {
    sides: ['top', 'bottom', 'left', 'right'].map((k, i) => ({
      a: [35, 43, 52], // 外枠の色(共通)
      b: (i == 0 ? [96, 120, 133] : [71, 82, 90]), // 内枠の色(topのみ異なる)
      tolA: [100, 100, 80, 80][i], // 許容差のリスト (許容差はRGB空間のユークリッド距離)
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
    o = { ...this.defaultOptions, ...o };
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
      else { for (let x = b; x >= a; x--) { const f = colFrac(x, ya, yb, bit); if (f > bestScore) { bestScore = f; best = x; } } }
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
        if (type === "percent") {
          // 短い方のX％以上が重なっている
          if (Math.min(T.e, B.e) - Math.max(T.s, B.s) < threthold * Math.min(T.e - T.s, B.e - B.s)) continue;
        } else if (type === "pixel") {
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
      if (found) logtext += 'found! ' + foundtag;
      if (why.length > 0) logtext += ["", ...why.slice(0, 3)].join("\n\t");
      log.push(logtext);
    }

    // 高スコア順に採用する。これにより、同じ下辺・左右辺に複数の上辺が対応する場合も
    // 最初に見つかった上辺ではなく、四隅の整合性が最も高い候補が優先される。
    candidates.sort((a, b) => b.score - a.score);
    const rects = [];
    for (const c of candidates) {
      if (rects.some(r => {
        // 重複する候補を除外
        if (c.x === r.x && c.y === r.y && c.w === r.w && c.h === r.h) return true;
        return false;
      })) continue;
      rects.push({ x: c.x, y: c.y, w: c.w, h: c.h });
    }

    // 他の候補を内包する候補は除外する
    const filterdRects = rects.filter(r =>
      !rects.some(r2 => {
        return r !== r2
          && r.x <= r2.x
          && r.y <= r2.y
          && r2.x + r2.w <= r.x + r.w
          && r2.y + r2.h <= r.y + r.h
      })
    );

    return { rects: filterdRects, tops, bots, lefts, rights, log };
  }
}


/**
 * 汎用画像マッチ
 * 単純な矩形探査
 * @returns {rects}
 */
function match_image(
  { src, srcW, srcH, srcRect = {} },
  { match, matchW, matchH, matchRect = {} },
  tol = 20, cover = 0.8, isMulti = false
) {
  /*
    範囲から画像マッチ
    tolは色の許容差 (RGB空間のユークリッド距離)。各色差の2乗の和とtolの2乗を比較
    coverはミスマッチの許容割合
    isMulti=falseなら最初にマッチした時点で終了し長さ1のrect配列を返す
    trueならすべてのマッチを配列に入れて返す
  */
  const tol2 = tol * tol;
  const minX = srcRect.x ?? 0;
  const minY = srcRect.y ?? 0;
  const maxX = srcRect.w !== undefined ? minX + srcRect.w - matchW : srcW - matchW;
  const maxY = srcRect.h !== undefined ? minY + srcRect.h - matchH : srcH - matchH;
  const mX0 = matchRect.x ?? 0;
  const mY0 = matchRect.y ?? 0;
  const mX1 = matchRect.w !== undefined ? mX0 + matchRect.w : matchW;
  const mY1 = matchRect.h !== undefined ? mY0 + matchRect.h : matchH;
  const totalPixels = (mX1 - mX0) * (mY1 - mY0);
  const maxMismatch = Math.floor(totalPixels * (1 - cover));
  const rects = [];

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let mismatch = 0;
      let matched = true;

      for (let my = mY0; my < mY1 && matched; my++) {
        for (let mx = mX0; mx < mX1; mx++) {
          const srcIdx = ((y + my - mY0) * srcW + (x + mx - mX0)) * 4;
          const matchIdx = (my * matchW + mx) * 4;

          const dr = src[srcIdx] - match[matchIdx];
          const dg = src[srcIdx + 1] - match[matchIdx + 1];
          const db = src[srcIdx + 2] - match[matchIdx + 2];

          if (dr * dr + dg * dg + db * db > tol2) {
            mismatch++;
            if (mismatch > maxMismatch) {
              matched = false;
              break;
            }
          }
        }
      }

      if (matched) {
        rects.push({ x, y, w: matchW, h: matchH });
        if (!isMulti) return rects;
      }
    }
  }

  return rects;
}

/*
  // 範囲がアイテムツールチップかどうかを判定する
  // 装備かどうかなど細分化は別判定
  // 探査画像をロード方式から埋め込みに変更
  // ロード方式は残しておく
*/
class ItemTooltipChecker {
  static initialized = false;
  static initPromise = null;
  static defaultOptions = {
    sides: ['top', 'bottom', 'left', 'right'].map((k, i) => ({
      side: k,
      path: "https://roclaknn.github.io/tools/images/item_frame_" + k[0] + ".bmp", // 埋込式では不使用
      rgba: [],
      w: 0,
      h: 0,
      tol: [15, 15, 15, 15][i], // 各辺の許容差 (RGB空間のユークリッド距離)
    })),
    cover: 0.8,
    matchsidenum: 2, // マッチする辺の目標数（巨大アイコンやカーソルの重なりを考慮する）
  };

  /**
   * 画像ファイルからRGBA配列を読み込んでキャッシュする
   * @param {string} path 画像ファイルのパス
   * @returns {Promise<{rgba: Uint8ClampedArray, w: number, h: number}>}
   */
  static loadImage(path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        resolve({
          rgba: imageData.data,
          w: img.width,
          h: img.height
        });
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${path}`));
      img.src = path;
    });
  }

  /**
   * すべての辺の画像情報（コードとして埋め込んである）を書き込む
   * base64で記述しておきデコードして書き込む
   */
  static init() {
    if (this.initialized) return;
    const data = {
      top: {
        rgba:
          'd4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS' +
          '/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eE' +
          'kv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93' +
          'hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/3eEkv93hJL/d4SS/5+nsf+hqbP/oamz/6Gps/+hqbP/' +
          'oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz' +
          '/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/6Gp' +
          's/+hqbP/oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/6Gps/+h' +
          'qbP/oamz/6Gps/+hqbP/oamz/6Gps/+hqbP/oamz/5+nsf8=',
        w: 70, h: 2,

      },
      bottom: {
        rgba:
          '19jY/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ' +
          '/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ' +
          '2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y' +
          '2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/2NnZ/9jZ2f/Y2dn/19jY/8jIyf/IyMn/yMjJ/8jIyf/IyMn/' +
          'yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ' +
          '/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jI' +
          'yf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/I' +
          'yMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf/IyMn/yMjJ/8jIyf8=',
        w: 70, h: 2,
      },
      left: {
        rgba:
          'eYWT/5+osv96hpT/oqu0/3qGlP+iq7T/e4eU/6OrtP98h5X/pKu1/3yIlf+krLX/fYmW/6Sttv9+iZb/pa22/3+Kl/+mrbb/gIuX' +
          '/6autv+Ai5j/pq63/4GMmP+nr7f/go2Z/6ivuP+DjZn/qK+4/4SOmv+psLj/hY+a/6qxuP+GkJv/q7K5/4eQm/+rsrn/iJGc/6yy' +
          'uv+Jkpz/rbO6/4qTnf+ttLv/i5Se/660u/+MlJ7/r7S7/42Vn/+vtbz/jpaf/7C2vP+Pl6D/sba9/5CYof+yt73/kZmh/7K4vf+S' +
          'mqL/s7i+/5Oao/+0uL//lJuj/7S5v/+VnKT/tbq//5adpf+2u8D/l56l/7a7wP+Yn6b/t7zB/5mfpv+4vMH/mqCn/7i9wv+boaj/' +
          'ub3C/52iqP+7vsL/naOp/7u/w/+epKr/u7/E/5+kqv+8v8T/oKWr/73AxP+hpqv/vcHE/6KnrP++wsX/o6is/7/Cxf+kqK3/v8LG' +
          '/6Wprv/Aw8b/pqqu/8HExv+nqq//wsTH/6err//CxMf/qKyw/8LFyP+prLD/w8XI/6qtsf/Exsn/q66y/8TGyf+tsLP/xsjK/6+y' +
          'tf/Hycv/sbO2/8nKzP+ztbf/ysvN/7W3uf/Lzc7/tri6/8zNz/+4urz/zc/Q/7q7vf/P0NH/u72+/9DR0v+9vsD/0dLT/77Awf/S' +
          '09T/wMHC/9PU1P/BwsT/1NTW/8LDxf/U1df/xMXG/9XW1v8=',
        w: 2, h: 70,
      },
      right: {
        rgba:
          'n6iy/3mFk/+iq7T/eoaU/6KrtP96hpT/o6u0/3uHlP+kq7X/fIeV/6Sstf98iJX/pK22/32Jlv+lrbb/fomW/6attv9/ipf/pq62' +
          '/4CLl/+mrrf/gIuY/6evt/+BjJj/qK+4/4KNmf+or7j/g42Z/6mwuP+Ejpr/qrG4/4WPmv+rsrn/hpCb/6uyuf+HkJv/rLK6/4iR' +
          'nP+ts7r/iZKc/620u/+Kk53/rrS7/4uUnv+vtLv/jJSe/6+1vP+NlZ//sLa8/46Wn/+xtr3/j5eg/7K3vf+QmKH/sri9/5GZof+z' +
          'uL7/kpqi/7S4v/+TmqP/tLm//5Sbo/+1ur//lZyk/7a7wP+WnaX/trvA/5eepf+3vMH/mJ+m/7i8wf+Zn6b/uL3C/5qgp/+5vcL/' +
          'm6Go/7u+wv+doqj/u7/D/52jqf+7v8T/nqSq/7y/xP+fpKr/vcDE/6Clq/+9wcT/oaar/77Cxf+ip6z/v8LF/6OorP+/wsb/pKit' +
          '/8DDxv+lqa7/wcTG/6aqrv/CxMf/p6qv/8LEx/+nq6//wsXI/6issP/Dxcj/qayw/8TGyf+qrbH/xMbJ/6uusv/GyMr/rbCz/8fJ' +
          'y/+vsrX/ycrM/7Gztv/Ky83/s7W3/8vNzv+1t7n/zM3P/7a4uv/Nz9D/uLq8/8/Q0f+6u73/0NHS/7u9vv/R0tP/vb7A/9LT1P++' +
          'wMH/09TU/8DBwv/U1Nb/wcLE/9TV1//Cw8X/1dbW/8TFxv8=',
        w: 2, h: 70,
      },
    };
    this.defaultOptions.sides.forEach(side => {
      const k = side.side;
      const d = data[k];
      d.rgba = Uint8ClampedArray.from(atob(d.rgba), c => c.charCodeAt(0));
      Object.assign(side, d);
      d.rgba = "";
    });
    this.initialized = true;
  }

  /**
   * すべての辺の画像を非同期で読み込む
   * @returns {Promise<void>}
   */
  /*
  static async init() {
    
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      for (const side of this.defaultOptions.sides) {
        try {
          const loaded = await this.loadImage(side.path);
          side.rgba = loaded.rgba;
          side.w = loaded.w;
          side.h = loaded.h;
        } catch (e) {
          console.error(`Failed to load ${side.path}:`, e);
        }
      }
      this.initialized = true;
    })();

    return this.initPromise;
  }
    */

  /**
   * アイテムツールチップかどうかを判定する。
   * 各辺がマッチすれば成功
   * @param {Uint8ClampedArray|Uint8Array} src 元画像のRGBA配列
   * @param {number} srcW 元画像の幅
   * @param {number} srcH 元画像の高さ
   * @param {{x:number, y:number, w:number, h:number}} rect 探査対象の矩形（絶対座標）
   * @returns {Promise<boolean>}
   */
  static run(src, srcW, srcH, rect, o = {}) {
    if (!this.initialized) return false; // 未初期化なら不一致扱い
    o = { ...this.defaultOptions, ...o };

    // rect内の探査範囲（相対座標）
    const searchRect = {
      x: rect.x + 10,
      y: rect.y + 10,
      w: Math.min(rect.w - 20, 100),
      h: Math.min(rect.h - 20, 200)
    };

    // 各辺のテンプレートを順にマッチング
    let matchcount = 0;
    const minMatch = o.matchsidenum;
    for (const side of o.sides) {
      if (!side.rgba || side.rgba.length === 0) continue;

      const matchResult = match_image(
        { src, srcW, srcH, srcRect: searchRect },
        { match: side.rgba, matchW: side.w, matchH: side.h },
        side.tol,
        o.cover,
        false
      );
      if (matchResult.length > 0) {
        matchcount++;
        if (matchcount >= minMatch) return true;
      }
    }

    return false;
  }
}
ItemTooltipChecker.init();

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
    o = { ...this.defaultOptions, ...o };

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
      Math.abs(src[i] - 133) <= tol &&
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
          Math.abs(src[i] - p[2]) > tol ||
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


class MakeCornerTransparent {
  static width = 9;
  static height = 8;
  static topleft;
  static topright;
  static bottomleft;
  static bottomright;
  static init() {
    // 各値は不透明度(0=完全透明, 255=不透明)。左上の角を基準に他3つへ反転コピーする
    const tl = this.topleft = [
      0, 0, 0, 0, 0, 9, 126, 211, 253,
      0, 0, 0, 0, 119, 251, 255, 255, 255,
      0, 0, 5, 184, 255, 255, 255, 255, 255,
      0, 0, 184, 255, 255, 255, 255, 255, 255,
      0, 123, 255, 255, 255, 255, 255, 255, 255,
      9, 255, 255, 255, 255, 255, 255, 255, 255,
      131, 255, 255, 255, 255, 255, 255, 255, 255,
      216, 255, 255, 255, 255, 255, 255, 255, 255
    ];

    const len = tl.length;
    const tr = this.topright = new Array(len),
      bl = this.bottomleft = new Array(len),
      br = this.bottomright = new Array(len);

    tl.forEach((pxd, i) => {
      const w = this.width, h = this.height;
      const x = i % w, y = ~~(i / w);
      tr[(w - 1 - x) + y * w]
        = bl[x + (h - 1 - y) * w]
        = br[(w - 1 - x) + (h - 1 - y) * w]
        = pxd;
    });
  }

  /**
   * 四隅を透明化した新しいCanvasを返す(元のCanvasは変更しない)
   * 既存のアルファ値に角のマスク(0〜255)を掛けるので、元から透明な部分はそのまま
   * @param {HTMLCanvasElement} src 切り抜き済みの画像
   * @returns {HTMLCanvasElement}
   */
  static run(src) {
    const W = src.width, H = src.height;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const g = out.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);

    const mw = this.width, mh = this.height;
    if (W < mw * 2 || H < mh * 2) return out;   // 小さすぎて角が重なる場合は何もしない

    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    const apply = (mask, ox, oy) => {
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          const m = mask[y * mw + x];
          if (m >= 255) continue;
          const p = ((oy + y) * W + ox + x) * 4 + 3;
          d[p] = Math.round(d[p] * m / 255);
        }
      }
    };
    apply(this.topleft, 0, 0);
    apply(this.topright, W - mw, 0);
    apply(this.bottomleft, 0, H - mh);
    apply(this.bottomright, W - mw, H - mh);
    g.putImageData(img, 0, 0);
    return out;
  }
}
MakeCornerTransparent.init();