/* よぞらロジック 問題検証ツール
   使い方: node tools/yozora-validate.js
   全問について以下を機械検証する。ひとつでも落ちたらexit 1。
   1. データ形状(正方形・文字は . と # のみ・id重複なし・必須フィールド)
   2. 論理だけで解けること: 行/列の数字ヒントから制約伝播のみで
      全マスが確定する(=推測不要・唯一解)ことをソルバーで確認する。
      これが通らない問題は人間が「当てずっぽう」を強いられるので不採用 */
'use strict';
const path = require('path');
const YOZORA = require(path.join(__dirname, '..', 'yozora-data.js'));

/* 行/列のヒント(連続する#の長さの並び)を解答から導出 */
function hintsOf(line){
  const h = [];
  let run = 0;
  for(const ch of line){
    if(ch === 1) run++;
    else if(run){ h.push(run); run = 0; }
  }
  if(run) h.push(run);
  return h.length ? h : [0];
}

/* 1本のライン(未知=-1/空=0/塗=1)にヒントを当てはめ、
   可能な全配置の共通部分を返す。配置が1つもなければnull(矛盾) */
function solveLine(hints, cells){
  const L = cells.length;
  const runs = hints[0] === 0 ? [] : hints;
  const canFill = new Array(L).fill(false);
  const canEmpty = new Array(L).fill(false);
  let found = false;

  function place(ri, pos, acc){
    if(ri === runs.length){
      for(let i = pos; i < L; i++){
        if(cells[i] === 1) return;
        acc[i] = 0;
      }
      found = true;
      for(let i = 0; i < L; i++){
        if(acc[i] === 1) canFill[i] = true; else canEmpty[i] = true;
      }
      return;
    }
    const len = runs[ri];
    const rest = runs.slice(ri + 1).reduce((a, b) => a + b + 1, 0);
    for(let s = pos; s + len + rest <= L; s++){
      /* s..s+len-1 を塗る。手前 pos..s-1 は空 */
      let ok = true;
      for(let i = pos; i < s && ok; i++) if(cells[i] === 1) ok = false;
      for(let i = s; i < s + len && ok; i++) if(cells[i] === 0) ok = false;
      const sepIdx = s + len;
      if(ok && ri < runs.length - 1 && cells[sepIdx] === 1) ok = false;
      if(ok){
        const acc2 = acc.slice();
        for(let i = pos; i < s; i++) acc2[i] = 0;
        for(let i = s; i < s + len; i++) acc2[i] = 1;
        let next = sepIdx;
        if(ri < runs.length - 1){ acc2[sepIdx] = 0; next++; }
        place(ri + 1, next, acc2);
      }
    }
  }
  place(0, 0, new Array(L).fill(-1));
  if(!found) return null;

  return cells.map((c, i) => {
    if(c !== -1) return c;
    if(canFill[i] && !canEmpty[i]) return 1;
    if(!canFill[i] && canEmpty[i]) return 0;
    return -1;
  });
}

/* 制約伝播のみで解く。全確定→解を返す / 矛盾→'contradiction' / 停滞→'stuck' */
function solveByLogic(rowHints, colHints, size){
  let grid = Array.from({length: size}, () => new Array(size).fill(-1));
  for(let guard = 0; guard < size * size + 10; guard++){
    let changed = false;
    for(let r = 0; r < size; r++){
      const res = solveLine(rowHints[r], grid[r]);
      if(res === null) return 'contradiction';
      for(let c = 0; c < size; c++){
        if(res[c] !== grid[r][c]){ grid[r][c] = res[c]; changed = true; }
      }
    }
    for(let c = 0; c < size; c++){
      const col = grid.map(row => row[c]);
      const res = solveLine(colHints[c], col);
      if(res === null) return 'contradiction';
      for(let r = 0; r < size; r++){
        if(res[r] !== grid[r][c]){ grid[r][c] = res[r]; changed = true; }
      }
    }
    if(grid.every(row => row.every(c => c !== -1))) return grid;
    if(!changed) return 'stuck';
  }
  return 'stuck';
}

/* ---------- 検証本体 ---------- */
const errors = [];
const ids = new Set();

for(const p of YOZORA.puzzles){
  const tag = p.id + '(' + (p.name || '?') + ')';
  for(const f of ['id', 'name', 'color', 'words', 'pic']){
    if(!p[f]) errors.push(tag + ': ' + f + ' がない');
  }
  if(ids.has(p.id)) errors.push(tag + ': id重複');
  ids.add(p.id);
  if(!Array.isArray(p.pic)) continue;

  const size = p.pic.length;
  if(p.pic.some(row => row.length !== size)){
    errors.push(tag + ': 正方形でない');
    continue;
  }
  if(p.pic.some(row => /[^.#]/.test(row))){
    errors.push(tag + ': . と # 以外の文字がある');
    continue;
  }
  const sol = p.pic.map(row => [...row].map(ch => ch === '#' ? 1 : 0));
  const rowHints = sol.map(hintsOf);
  const colHints = Array.from({length: size}, (_, c) => hintsOf(sol.map(row => row[c])));

  const result = solveByLogic(rowHints, colHints, size);
  if(result === 'contradiction'){
    errors.push(tag + ': ヒントに矛盾(データ生成バグ)');
  } else if(result === 'stuck'){
    errors.push(tag + ': 論理だけでは解けない(複数解 or 推測が必要)→ 絵を修正');
  } else {
    const same = result.every((row, r) => row.every((v, c) => v === sol[r][c]));
    if(!same) errors.push(tag + ': ソルバーの解が元の絵と一致しない(複数解)');
  }
}

const total = YOZORA.puzzles.length;
if(errors.length){
  console.error('✗ 検証NG (' + errors.length + '件 / 全' + total + '問)');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
} else {
  const sizes = {};
  YOZORA.puzzles.forEach(p => { sizes[p.pic.length] = (sizes[p.pic.length] || 0) + 1; });
  console.log('✓ 全' + total + '問OK(唯一解・論理のみで解けることを確認)');
  console.log('  内訳: ' + Object.entries(sizes).map(([s, n]) => s + '×' + s + '=' + n + '問').join(' / ')
    + ' / 無料枠=' + YOZORA.FREE + '問');
}
