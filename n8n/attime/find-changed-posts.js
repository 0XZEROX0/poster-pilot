// Finds rows whose price or poster changed after the poster was approved or scheduled.
//  - A post that is already scheduled on Facebook with an old price/poster is cancelled; its time slot is kept in 'Reschedule slot'
//    so the new poster takes the same slot when it is Done again.
//  - A caption whose price no longer matches the sheet is cleared, so a new one is written.
//  - A poster built with an older price is sent back for a redo (Feedback Redo). If the row was Done, it is marked Auto reschedule
//    so the poster workflow puts it back to Done and it is scheduled again by itself.
//  - A caption written by this workflow whose name, price or style no longer matches the sheet is rewritten (a scheduled post is
//    cancelled and takes the same slot again). The poster is NOT redone for a caption-only change.
//  - Feedback "Cancel" (added 2026-11-13): the post is taken off Facebook's schedule and its schedule columns are emptied.
// Rows already published, rows being worked on and rows too close to their slot are left alone.
const rows = $('Read Posts Sheet (Changes)').all().map(i => i.json);
const zone = 'Africa/Cairo';
const FMT = 'yyyy-MM-dd HH:mm';
const clean = v => (v === undefined || v === null) ? '' : String(v).trim();
const digits = v => clean(v).replace(/\D/g, '');

const tpls = {};
for (const t of $input.all().map(i => i.json)) {
  const k = clean(t['Template']).toLowerCase();
  if (k && clean(t['Caption text'])) tpls[k] = String(t['Caption text']);
}
if (!tpls['default']) tpls['default'] = '🔵 {name}\n🟠 {price} EGP\nwww.static-eg.com 🌐';
const norm = s => clean(s).replace(/\s+/g, ' ');
const fill = (tpl, vals) => {
  const out = [];
  for (const line of String(tpl).replace(/\r/g, '').split('\n')) {
    let drop = false;
    const l = line.replace(/\{(\w+)\}/g, (m, k) => { if (!(k in vals)) return m; if (!vals[k]) drop = true; return vals[k]; });
    if (!drop) out.push(l);
  }
  return out.join('\n').trim();
};
// A caption "was written by this workflow" when it has the shape of one of the templates (any name, any price).
const shapes = [];
for (const t of Object.values(tpls)) {
  for (const v of [t, t.split('\n').filter(l => l.indexOf('{before}') < 0).join('\n')]) {
    const parts = norm(v).split(/\{\w+\}/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    shapes.push(new RegExp('^' + parts.join('[\\s\\S]*?') + '$'));
  }
}
const isAuto = c => !!c && shapes.some(re => re.test(norm(c)));
// {name}: the items joined with ' + ', or for versions of one product the shared name and the versions (column Variants).
const wantCaption = r => {
  const items = [r['Item 1'], r['Item 2'], r['Item 3'], r['Item 4']].map(clean).filter(Boolean);
  const price = clean(r['Price after']) || clean(r['Price before']);
  if (!items.length || !price) return '';
  const before = clean(r['Price after']) && clean(r['Price before']) && clean(r['Price before']) !== clean(r['Price after']) ? clean(r['Price before']) : '';
  const cats = [r['Category 1'], r['Category 2'], r['Category 3']].map(clean).filter(Boolean);
  const vals = { name: clean(r['Variants']) || items.join(' + '), price, before, category: cats.join(' + '), company: clean(r['Company']), details: clean(r['Details']) };
  const want = clean(r['Caption style']).toLowerCase();
  return fill(tpls[tpls[want] ? want : 'default'], vals);
};
const now = DateTime.now().setZone(zone);
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

const out = [];
for (const r of rows) {
  // Feedback "Cancel": take the post off Facebook's schedule (if it is scheduled and not published yet), empty its schedule columns,
  // set FB status "Cancelled" and empty Feedback. Nothing is scheduled again until Feedback is set to Done (with a Post date/time).
  if (clean(r['Feedback']).toLowerCase() === 'cancel') {
    const cPost = clean(r['FB post id']);
    const cFb = clean(r['FB status']).toLowerCase();
    const cIg = clean(r['IG status']).toLowerCase();
    const isPub = /^(published|posted)/.test(cFb) || /^(published|posted)/.test(cIg);
    const keep = k => clean(r[k]);
    out.push({ json: {
      row_number: r.row_number,
      cancel: !isPub && !!cPost,
      postId: cPost,
      photoId: clean(r['FB photo id']),
      upd: isPub ? {
        'Scheduled for': keep('Scheduled for'), 'FB photo id': keep('FB photo id'), 'FB post id': cPost,
        'FB status': keep('FB status'), 'IG status': keep('IG status'), 'Scheduled price': keep('Scheduled price'),
        'Scheduled image': keep('Scheduled image'), 'Reschedule slot': keep('Reschedule slot'), 'Caption': keep('Caption'),
        'Feedback': 'Done', 'Auto reschedule': keep('Auto reschedule')
      } : {
        'Scheduled for': '', 'FB photo id': '', 'FB post id': '', 'FB status': 'Cancelled', 'IG status': '',
        'Scheduled price': '', 'Scheduled image': '', 'Reschedule slot': '', 'Caption': keep('Caption'),
        'Feedback': '', 'Auto reschedule': '', 'Post now': ''
      },
      why: isPub ? 'cancel asked but already published' : 'cancel asked'
    } });
    continue;
  }
  const link = clean(r['Image link']);
  if (link.indexOf('/d/') < 0) continue;
  if (clean(r['Photo status']).toUpperCase() !== 'OK') continue;
  const fb = clean(r['Feedback']).toLowerCase();
  if (fb === 'redo' || fb === 'redo next image' || fb === 'ignore') continue;
  const fbStatus = clean(r['FB status']).toLowerCase();
  const igStatus = clean(r['IG status']).toLowerCase();
  if (/^(published|posted)/.test(fbStatus) || /^(published|posted)/.test(igStatus)) continue;

  const after = digits(r['Price after']);
  const before = digits(r['Price before']);
  const eff = after || before;
  if (!eff) continue;
  const priceKey = (after ? before : '') + '|' + eff;
  const imageId = link.split('/d/')[1].split('/')[0];

  const postId = clean(r['FB post id']);
  const photoId = clean(r['FB photo id']);
  const slotText = clean(r['Scheduled for']);
  // Caption written by this workflow that no longer matches the name, price or caption style in the sheet: only the caption is replaced.
  const wanted = wantCaption(r);
  const capChanged = !!wanted && isAuto(clean(r['Caption'])) && norm(r['Caption']) !== norm(wanted);
  let cancel = false;
  let timeChanged = false;
  if (postId) {
    const slot = DateTime.fromFormat(slotText, FMT, { zone });
    if (!slot.isValid || slot < now.plus({ minutes: 5 })) continue;
    // A Post date/time that differs from the time it was scheduled for means it was changed: cancel and schedule again.
    const mm = parseManual(r);
    if (mm && mm.toFormat(FMT) !== slotText) timeChanged = true;
    const schedPrice = clean(r['Scheduled price']);
    const schedImage = clean(r['Scheduled image']);
    cancel = timeChanged || (schedPrice !== '' && schedPrice !== priceKey) || (schedImage !== '' && schedImage !== imageId) || capChanged;
  }

  // A Done row that has a Post date/time which cannot be used is told so in FB status (instead of silently waiting).
  let timeMsg = '';
  let postNowOff = false;
  if (!postId && fb === 'done' && /^yes$/i.test(clean(r['Post now']))) {
    // "Post now" (2026-11-15): the queue publishes it at once. Only a press older than 2 hours that never went out is
    // turned off here, with a note, so it is never posted late.
    const m3 = parseManual(r);
    if (!m3 || m3 < now.minus({ hours: 2 })) { postNowOff = true; timeMsg = 'Post now was not done in time - press Post now again or set a Post date and time'; }
  } else if (!postId && fb === 'done') {
    const m2 = parseManual(r);
    if (m2 === false) timeMsg = 'Check Post date and Post time (both are needed, time like 17:30)';
    // A time less than 30 minutes away is fine: the queue keeps it ("Waiting to post at ... from the app") and posts it at
    // that minute (2026-11-20). Only a time that passed without the post going out is reported.
    else if (m2 && m2 < now.minus({ minutes: 2 })) {
      const waited = /^waiting to post at/i.test(clean(r['FB status']));
      if (!waited) timeMsg = 'Post time is in the past - change Post date/time';
      else if (m2 < now.minus({ hours: 2 })) timeMsg = 'Was not posted at its time (the server was off) - set a new Post date/time or press Post now';
    }
    else if (m2 === null) {
      const kept = DateTime.fromFormat(clean(r['Reschedule slot']), FMT, { zone });
      if (!(kept.isValid && kept >= now.plus({ minutes: 20 }))) timeMsg = 'Waiting for Post date and Post time';
    }
  }
  const timeMsgNew = timeMsg !== '' && clean(r['FB status']) !== timeMsg;

  const caption = clean(r['Caption']);
  const cm = caption.match(/🟠\s*([\d,٬]+)/);
  const captionPrice = cm ? digits(cm[1]) : '';
  const clearCaption = (!postId || cancel) && captionPrice !== '' && captionPrice !== eff;

  const posterKey = clean(r['Poster price']);
  const stale = posterKey !== '' && posterKey !== priceKey;
  const setRedo = stale && (fb === 'done' || fb === '');

  if (!cancel && !clearCaption && !capChanged && !setRedo && !timeMsgNew) continue;

  out.push({ json: {
    row_number: r.row_number,
    cancel,
    postId,
    photoId,
    upd: {
      'Scheduled for': cancel ? '' : slotText,
      'FB photo id': cancel ? '' : photoId,
      'FB post id': cancel ? '' : postId,
      'FB status': cancel ? '' : (timeMsgNew ? timeMsg : clean(r['FB status'])),
      'IG status': cancel ? '' : clean(r['IG status']),
      'Scheduled price': cancel ? '' : clean(r['Scheduled price']),
      'Scheduled image': cancel ? '' : clean(r['Scheduled image']),
      'Reschedule slot': cancel && slotText && !timeChanged ? slotText : clean(r['Reschedule slot']),
      'Caption': (clearCaption || capChanged) ? wanted : caption,
      'Feedback': setRedo ? 'Redo' : clean(r['Feedback']),
      'Auto reschedule': setRedo ? (fb === 'done' ? 'yes' : '') : clean(r['Auto reschedule']),
      ...(postNowOff ? { 'Post now': '' } : {})
    },
    why: [timeChanged ? 'post date/time changed' : '', cancel && !timeChanged ? 'scheduled post out of date' : '', timeMsgNew ? 'time cannot be used' : '', clearCaption ? 'caption price changed' : '', capChanged ? 'caption name/price/style changed' : '', setRedo ? 'poster price changed' : ''].filter(Boolean).join(', ')
  } });
}
return out.slice(0, 20);


