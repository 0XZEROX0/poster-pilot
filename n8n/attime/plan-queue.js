const rows = $input.all().map(i => i.json);
const zone = 'Africa/Cairo';
const FMT = 'yyyy-MM-dd HH:mm';
const clean = v => (v === undefined || v === null) ? '' : String(v).trim();
const digits = v => clean(v).replace(/\D/g, '');
const parseManual = r => {
  // Post date + Post time typed in the sheet (Cairo time). null = not used, false = filled in wrongly or only half filled.
  const d = clean(r['Post date']);
  const t = clean(r['Post time']);
  if (!d && !t) return null;
  if (!d || !t) return false;
  const formats = ['yyyy-MM-dd H:mm', 'yyyy-M-d H:mm', 'yyyy-MM-dd H:mm:ss', 'yyyy-MM-dd h:mm a', 'd/M/yyyy H:mm', 'M/d/yyyy H:mm'];
  for (const f of formats) {
    const x = DateTime.fromFormat(d + ' ' + t, f, { zone });
    if (x.isValid) return x;
  }
  return false;
};

const now = DateTime.now().setZone(zone);
const pending = rows.filter(r => {
  const link = clean(r['Image link']);
  return clean(r['Feedback']).toLowerCase() === 'done'
    && link.indexOf('/d/') > -1
    && !/^(WORKING|PHOTO FOUND)/i.test(clean(r['Photo status']))
    && !clean(r['Scheduled for']);
});

const buildCaption = r => {
  const items = [r['Item 1'], r['Item 2'], r['Item 3']].map(clean).filter(Boolean);
  const priceRaw = clean(r['Price after']) || clean(r['Price before']);
  const lines = ['🔵 ' + items.join(' + ')];
  if (priceRaw) lines.push('🟠 ' + priceRaw + ' EGP');
  lines.push('مول البستان - الدور العاشر - static📌');
  lines.push('لمعرفة جميع الأسعار وطلب المنتجات:-');
  lines.push('www.static-eg.com 🌐');
  lines.push('شحن لجميع أنحاء مصر');
  lines.push('خدمات تقسيط⏳✅:, البنك الأهلي, بنك القاهرة, بنك مصر, CIB ,بنك المشرق, بنك الأمارات دبي الوطني, سهولة');
  lines.push('للمبيعات وأونلاين☎️:01223311744');
  lines.push('للصيانة و الدعم الفني☎️:01289488111');
  lines.push('رقم فرع البستان☎️:01272222829');
  // The caption already in the sheet (created earlier and possibly edited by you) is the final one.
  // The generated text is only a fallback for a row that has no caption yet.
  return clean(r['Caption']) || lines.join('\n');
};
const make = (r, slot) => {
  const after = digits(r['Price after']);
  const before = digits(r['Price before']);
  const link = clean(r['Image link']);
  return { json: {
    row_number: r.row_number,
    fileId: link.split('/d/')[1].split('/')[0],
    caption: buildCaption(r),
    priceKey: (after ? before : '') + '|' + (after || before),
    slotLocal: slot.toFormat(FMT),
    slotUnix: Math.floor(slot.toMillis() / 1000)
  } };
};

// RULE (2026-11-13, from the user): nothing is ever scheduled automatically. A Done (approved) post is scheduled ONLY at the
// Post date and Post time that were set for it, as long as that is at least 15 minutes away. A Done post with no Post date/time
// waits (the change check shows "Waiting for Post date and Post time"). The old auto-plan (5 a day from 17:00) and the
// re-use of a kept "Reschedule slot" were both removed.
// POST NOW (2026-11-15, from the user): someone with the scheduling permission pressed "Post now" in the app and confirmed it.
// The app wrote Post now = yes and Post date/time = the moment they pressed it. Such a post is published on Facebook at once
// (not scheduled) and its Post date / Post time / Scheduled for become the real minute it went out; Instagram follows right
// after (see "Instagram now?"). It is only done while the press is fresh (2 hours): a press the engine did not get to in time
// is never posted late; the change check tells the person to press again. A post Facebook already holds is never posted twice.
// FROM THE APP (2026-11-20, from the user): Facebook only takes a scheduled post well ahead of its time. A Post date/time
// less than LOCAL_MIN minutes away is NOT put on Facebook's schedule: the post gets FB status "Waiting to post at 17:00
// from the app" (item local: true -> "Post from the app later?" -> Save waiting status + Start post timer). The timer
// (workflow "Static OS - Post at time") runs this queue part again at that minute, and the post is then published at once
// through the Post now path (Instagram follows right after). A waiting post whose minute was missed (server off) is still
// sent up to 2 hours late, never later; the change check then says so.
const POST_NOW_HOURS = 2;
const LOCAL_MIN = 30;
const LOCAL_LATE_HOURS = 2;
const localText = m => 'Waiting to post at ' + m.toFormat('HH:mm') + ' from the app';
const isLocal = r => /^waiting to post at/i.test(clean(r['FB status']));
const out = [];
const nowRows = [];
const manualRows = [];
const localRows = [];
for (const r of pending) {
  const m = parseManual(r);
  if (/^yes$/i.test(clean(r['Post now']))) {
    if (clean(r['FB post id'])) continue;
    if (m && m >= now.minus({ hours: POST_NOW_HOURS }) && m <= now.plus({ minutes: 5 })) nowRows.push(r);
    continue;
  }
  if (!m) continue;
  if (m >= now.plus({ minutes: LOCAL_MIN })) manualRows.push({ r, m });
  else if (m > now.plus({ seconds: 30 })) { if (clean(r['FB status']) !== localText(m)) localRows.push({ r, m }); }
  else if (clean(r['FB post id'])) continue;
  else if (isLocal(r) ? m >= now.minus({ hours: LOCAL_LATE_HOURS }) : m >= now.minus({ minutes: 2 })) nowRows.push(r);
}
manualRows.sort((a, b) => a.m.toMillis() - b.m.toMillis());
for (const x of localRows.slice(0, 25)) {
  out.push({ json: { row_number: x.r.row_number, local: true, waitUntil: x.m.toISO(), status: localText(x.m) } });
}
for (const r of nowRows.slice(0, 5)) {
  const x = make(r, now);
  x.json.postNow = true;
  x.json.postDate = now.toFormat('yyyy-MM-dd');
  x.json.postTime = now.toFormat('HH:mm');
  out.push(x);
}
manualRows.slice(0, Math.max(0, 25 - out.filter(x => !x.json.local).length)).forEach(x => out.push(make(x.r, x.m)));
return out;

