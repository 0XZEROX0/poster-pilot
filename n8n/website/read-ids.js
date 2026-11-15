// "Pages to read": every page id in Settings.groups and Settings.renames.
const S = $('Settings').first().json;
const ids = new Set();
for (const x of String(S.groups || '').split(/[;,]/)) if (Number(x)) ids.add(Number(x));
for (const part of String(S.renames || '').split(';')) { const m = part.match(/^\s*(\d+)\s*=/); if (m) ids.add(Number(m[1])); }
return [...ids].map(id => ({ json: { id } }));
