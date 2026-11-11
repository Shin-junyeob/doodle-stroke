// 렌더러 — 가닥마다 선분별 lineWidth + round cap 으로 긋는다. 퇴로 A(외곽선 fill)로 바꿀 때 이 파일만 바뀐다.
(function () {
  'use strict';
  function render(ctx, strands, color) {
    ctx.save();
    ctx.strokeStyle = color || '#1d2f33';
    ctx.lineCap = 'round';
    for (const { points: p, widths: w } of strands) {
      if (p.length === 1) {
        ctx.beginPath();
        ctx.arc(p[0][0], p[0][1], w[0] / 2, 0, 2 * Math.PI);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      }
      for (let i = 1; i < p.length; i++) {
        ctx.beginPath();
        ctx.moveTo(p[i - 1][0], p[i - 1][1]);
        ctx.lineTo(p[i][0], p[i][1]);
        ctx.lineWidth = (w[i - 1] + w[i]) / 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  globalThis.doodle = Object.assign(globalThis.doodle || {}, { render });
})();
