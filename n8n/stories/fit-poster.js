// Stories part, "Fit Poster": where the poster sits on the 1080x1920 story picture.
// Input: Poster Size (Edit Image information of the downloaded poster). The poster is fitted into 960 x 1180
// (kept clear of Instagram's top 250 px and bottom 340 px), centred a little above the middle, with the two text
// lines under it. The background is the poster stretched to 1920 high, centre-cropped to 1080 wide, then blurred.
const out = [];
const src = $('One story picture each').all();
$input.all().forEach((item, n) => {
  const info = item.json || {};
  const size = info.size || {};
  const W = Number(size.width) || 1080, H = Number(size.height) || 1080;
  let w = 960, h = Math.round(960 * H / W);
  if (h > 1180) { h = 1180; w = Math.round(1180 * W / H); }
  const x = Math.round((1080 - w) / 2);
  const y = Math.max(260, Math.round((1920 - h) / 2) - 90);
  const bgW = Math.max(1080, Math.round(1920 * W / H));
  const base = (src[n] || src[0] || { json: {} }).json;
  out.push({
    json: Object.assign({}, base, { w, h, x, y, bgW, bgX: Math.round((bgW - 1080) / 2), textY: Math.min(1460, y + h + 60) }),
    binary: { data: item.binary.data, poster: item.binary.data },
    pairedItem: { item: n },
  });
});
return out;
