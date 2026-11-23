// "Build" Code node of "Static OS - Offer to website": the website call for each post this run claimed (a claim
// that failed its precondition, because the post changed meanwhile, is left for the next run).
// The product is made like the Static Friday bundle offers added by hand (product 13040, 2026-11-23): simple product,
// name = the products joined with " + ", Price before crossed out (regular price) and Price after (sale price), in
// stock, reviews off, category STATIC FRIDAY (797) only, the brands of its products, the poster as its one photo,
// description = the name as a centred heading, Rank Math focus keyword = the name, primary category 797.
// A product with a date in the future is held by WordPress as "scheduled" and goes live by itself at that minute.
const CATEGORY = 797;
// The website takes a photo only from a link that ends in .jpg, so the poster is served by this workflow's own
// webhook (it checks that the post is being added right now, and that the file is that post's poster).
const POSTER = 'https://static-server.tail0ea3a8.ts.net/webhook/d4c1dd09-58b2-4dce-8b84-26010d881e3b/offer-poster/';
const API = 'https://static-eg.com/wp-json/wc/v3/products';
const clean = v => (v === undefined || v === null) ? '' : String(v).trim();
const plan = $('Plan').first().json;
const claim = $('Claim posts').first().json || {};
const status = claim.status || [];
const brands = $('Read brands').all().map(i => i.json).filter(b => b && b.id && b.name);
const num = s => Number(clean(s).replace(/[^\d.]/g, '')) || 0;
const words = s => ' ' + clean(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
const slug = s => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'offer';
const esc = s => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const out = [];
plan.posts.forEach((p, i) => {
  if (status[i] && status[i].code) return;
  const job = { id: p.id, name: p.name, kind: p.kind, state: p.state || '', note: p.note || '', at: p.at || '', productId: p.productId, posterUrl: p.posterUrl, title: '' };
  const full = p.items.map(it => [it.name, it.label].filter(Boolean).join(' ')).filter(Boolean).join(' + ');
  const name = ((p.variants && p.title) ? p.title : full).slice(0, 200);
  job.title = name;
  if (p.kind === 'clear') return out.push({ json: Object.assign(job, { call: false }) });
  if (p.kind === 'hide') return out.push({ json: Object.assign(job, { call: true, url: API + '/' + p.productId, body: { status: 'draft' } }) });
  if (p.kind === 'publish') return out.push({ json: Object.assign(job, { call: true, url: API + '/' + p.productId, body: { status: 'publish' } }) });
  // upsert
  const before = num(p.priceBefore), after = num(p.priceAfter);
  if (!name || !(before || after)) return out.push({ json: Object.assign(job, { kind: 'clear', state: 'failed', note: !name ? 'The offer has no products.' : 'The offer has no price.', call: false }) });
  const sale = after && before > after;
  // Brands: the companies of its products (from the price list), else any brand name found in the product names.
  const companies = p.company.split('+').map(c => words(c).trim()).filter(Boolean);
  const hay = words(name);
  const picked = brands.filter(b => companies.includes(words(b.name).trim()) || companies.includes(words(b.slug).trim()) || hay.includes(words(b.name)));
  const body = {
    name, type: 'simple', status: 'publish', catalog_visibility: 'visible',
    regular_price: String(sale ? before : (after || before)), sale_price: sale ? String(after) : '',
    description: '<h4 style="text-align: center">' + esc(name) + '</h4>', short_description: '',
    categories: [{ id: CATEGORY }], brands: picked.map(b => ({ id: b.id })),
    stock_status: 'instock', manage_stock: false, reviews_allowed: false,
    meta_data: [{ key: 'rank_math_focus_keyword', value: name }, { key: 'rank_math_primary_product_cat', value: String(CATEGORY) }],
  };
  // A new photo only for a new product or a new poster (each upload adds a file to the website's media library).
  if (!p.productId || p.webPoster !== p.posterUrl) body.images = [{ src: POSTER + p.id + '-' + p.driveId.replace(/[^A-Za-z0-9]/g, '').slice(-8) + '-' + slug(name) + '.jpg', name, alt: name }];
  // Not live yet: it goes live at the post's time (WordPress holds it as scheduled), or now.
  if (!p.live) {
    const when = p.at ? DateTime.fromFormat(p.at, 'yyyy-MM-dd HH:mm', { zone: 'Africa/Cairo' }) : DateTime.now();
    body.date_created_gmt = when.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss");
  }
  out.push({ json: Object.assign(job, { call: true, url: p.productId ? API + '/' + p.productId : API, body }) });
});
return out;
