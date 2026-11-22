// Posters with 2 or 3 items (or 2-4 versions of one product, post.variants): products fill the product box as a group, each scaled by its real-world size and standing on the same line. All items stand straight. The layout (row, stack or pyramid) is picked in the page so the group fills the product box best: wide flat items like a keyboard and mouse pad are stacked upwards instead of sitting in one thin row. The item names are stacked one under the other (one line per item).
// Real sizes come from the 'Sizes' tab (category + optional word in the name -> longest side in mm), so a CPU is much smaller than a motherboard,
// a cooler smaller than a case, and so on. Posters with one item pass through unchanged.
const item = JSON.parse(JSON.stringify($('Build Poster Page').first().json));
const info = $('Merge Photo Paths').first().json;
const products = Array.isArray(info.products) ? info.products : [];
const n = products.length;
if (n < 2 || n > 4 || !item.screenshot_request || !item.screenshot_request.html) return [{ json: item }];
let h = item.screenshot_request.html;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// 0) Real size (mm) of every product from its category (Category 1-3 next to Item 1-3) and its name.
const sizeRows = (($input.first().json && $input.first().json.values) || []).map(r => ({ cat: String(r[0] || '').trim().toLowerCase(), kw: String(r[1] || '').trim().toLowerCase(), mm: Number(r[2]) })).filter(r => r.cat && isFinite(r.mm) && r.mm > 0);
const normName = s => String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
let prow = {};
try { prow = $('Read Posts Rows').all().map(i => i.json).find(r => r.row_number === info.row_number) || {}; } catch (e) {}
const catFor = name => { for (const k of [1, 2, 3, 4]) { if (normName(prow['Item ' + k]) === normName(name)) return String(prow['Category ' + k] || '').trim(); } return ''; };
const DEF = { 'monitor': 600, 'case': 450, 'case fans': 120, 'mb': 305, 'cpu': 120, 'vga': 300, 'cooler': 160, 'ram': 140, 'ssd': 100, 'psu': 160, 'acc': 150, 'laptop': 380 };
const ACC_NAME = [[/mouse\s*pad|mousepad|desk\s*mat/i, 800], [/wrist/i, 380], [/keyboard|\bPD\d{2}|\bWKL-?\d|\b\d{2,3}%/i, 380], [/\bmouse\b|\bP1-1K|\bGWH\d/i, 125], [/headset|headphone/i, 200], [/gamepad|controller/i, 160], [/monitor\s*arm/i, 450]];
const mmFor = (cat, name) => {
  const c = String(cat).toLowerCase(), nm = String(name).toLowerCase();
  const kwHit = sizeRows.find(r => r.cat === c && r.kw && nm.includes(r.kw));
  if (kwHit) return kwHit.mm;
  if (c === 'mb' && /\b[a-z]?\d{3,4}m(?:[-\s]|$)/i.test(String(name))) return 245;
  // Accessories without their own Sizes row get a size from the kind of product in the name (a keyboard is much bigger than a mouse).
  if (c === 'acc') { const hit = ACC_NAME.find(a => a[0].test(String(name))); if (hit) return hit[1]; }
  const plain = sizeRows.find(r => r.cat === c && !r.kw);
  if (plain) return plain.mm;
  return DEF[c] || 200;
};
const dims = products.map(p => mmFor(catFor(p.name), p.name));
// Where the person put each product in the offer editor: 0 back, 1 middle, 2 front, -1 not chosen (the layout decides).
const LAYER = { back: 0, middle: 1, front: 2 };
const layerFor = name => { for (const k of [1, 2, 3, 4]) { if (normName(prow['Item ' + k]) === normName(name)) { const v = LAYER[String(prow['Layer ' + k] || '').trim().toLowerCase()]; return v === undefined ? -1 : v; } } return -1; };
const layers = products.map(p => layerFor(p.name));

// 1) Names stacked, one per line. Spec words (size, resolution, Hz, ms, panel type) are taken out of each name (a monitor's specs are shown as icons),
// but the model name after them is kept; each name is kept to 7 words.
const SPEC_WORD = /^(?:\d{2}(?:\.\d)?(?:″|”|"|''|in|inch)|\d{2,3}hz|\d+(?:\.\d+)?ms|qhd|fhd|uhd|wqhd|uwqhd|4k|2k|ips|va|tn|oled|qd-oled|w-?oled)$/i;
const shorten = raw => {
  const words = String(raw || '').replace(/\bfast\s+ips\b/ig, 'IPS').replace(/\s+/g, ' ').trim().split(' ');
  const kept = words.filter((w, i) => !(i >= 2 && SPEC_WORD.test(w))).slice(0, 7);
  return kept.join(' ').replace(/[\s,\-\/|+]+$/, '');
};
// Versions of one product: the shared name once, and a smaller line naming the versions ("Jungle Panda · Hurricane Panda").
const vTitle = String(prow['Title'] || '').trim();
const vOpts = String(prow['Options'] || '').split(' / ').map(x => x.trim()).filter(Boolean);
const lines = vTitle ? [shorten(vTitle)] : products.map(p => shorten(p.name));
const longest = Math.max(...lines.map(l => l.length));
const size = vTitle ? (longest > 38 ? 34 : 40) : (longest > 50 ? 28 : (longest > 38 ? 32 : 36)) - (n >= 3 ? 4 : 0);
const optsHtml = vTitle && vOpts.length ? '<span class="opts">' + vOpts.map(esc).join(' &middot; ') + '</span>' : '';
h = h.replace(/<div class="name">[\s\S]*?<\/div>/, () => '<div class="name">' + lines.map(esc).join('<br>') + optsHtml + '</div>');

// 2) Product markup: one slot per product (placed and sized in the page by the script below).
const slots = products.map((p, i) => {
  const side = (n === 3 && i !== 1) ? ' side' : '';
  const src = p.data_url ? p.data_url : esc(p.url || '');
  const dsrc = p.data_url ? '' : ' data-src="' + esc(p.url || '') + '"';
  return '<div class="pitem' + side + '"><img class="product mp" src="' + src + '"' + dsrc + '><div class="lit pm rl"></div><div class="lit pm rr"></div><div class="tone pm tn"></div></div>';
}).join('');
let s = h.indexOf('<div class="reflclip">');
if (s < 0) s = h.indexOf('<div class="stage">');
const e = h.indexOf('<div class="tint">');
if (s < 0 || e < 0 || e < s) return [{ json: item }];
h = h.slice(0, s) + '<div class="stage mstage">' + slots + '</div>' + h.slice(e);
h = h.replace('<div class="poster">', '<div class="poster n' + n + '">');

const css = '.mstage{display:flex;align-items:flex-end;justify-content:center}'
  + 'body:not(.podium) .mstage{align-items:center}'
  + '.pitem{position:relative;min-width:0;margin:0 -2%}'
  + '.n2 .pitem{flex:0 0 56%;height:100%}'
  + '.n3 .pitem{flex:0 0 44%;height:100%;z-index:2}'
  + '.n3 .pitem.side{flex:0 0 38%;height:86%;z-index:1}'
  + '.rl{background:linear-gradient(to right,var(--lc,rgba(0,0,0,0)) 0%,rgba(0,0,0,0) 17%);mix-blend-mode:screen}'
  + '.rr{background:linear-gradient(to left,var(--rc,rgba(0,0,0,0)) 0%,rgba(0,0,0,0) 17%);mix-blend-mode:screen}'
  + '.tn{background:var(--tc,rgba(0,0,0,0));mix-blend-mode:soft-light}'
  + '.n4 .pitem{flex:0 0 34%;height:100%}'
  + '.n2 .shadow{width:700px}.n3 .shadow{width:820px}.n4 .shadow{width:860px}'
  + '.name .opts{display:block;font-size:0.5em;font-weight:700;letter-spacing:1px;line-height:1.3;margin-top:8px;opacity:0.92}'
  + (vTitle ? '.name{-webkit-line-clamp:5 !important}' : '')
  + '.name{font-size:' + size + 'px !important}';
h = h.replace('</style>', css + '</style>');

// 3) Browser-side: cutout safety net and edge lights for every product, then the real-size placement of the slots
// (re-checked every 150 ms for 6 s so it follows the final size of the product box).
const script = String.raw`<script>(function(){
var DIMS=__DIMS__,LAY=__LAYERS__;
function setup(el){
function sync(){try{var s=el.src,ms=el.parentNode.querySelectorAll('.pm');for(var i=0;i<ms.length;i++){ms[i].style.webkitMaskImage='url("'+s+'")';ms[i].style.maskImage='url("'+s+'")';ms[i].style.display='block';}}catch(e){}}
sync();
var p=new Image();p.crossOrigin='anonymous';
p.onload=function(){try{
var T=22,MAX=1600;
var s=Math.min(1,MAX/Math.max(p.naturalWidth,p.naturalHeight));
var W=Math.max(1,Math.round(p.naturalWidth*s)),H=Math.max(1,Math.round(p.naturalHeight*s));
var c=document.createElement('canvas');c.width=W;c.height=H;
var x=c.getContext('2d');x.drawImage(p,0,0,W,H);
var im=x.getImageData(0,0,W,H),d=im.data;
var rs=[],gs=[],bs=[],tr=0,n=0;
function samp(px,py){var k=(py*W+px)*4;n++;if(d[k+3]<20){tr++;}else{rs.push(d[k]);gs.push(d[k+1]);bs.push(d[k+2]);}}
for(var i=0;i<W;i+=2){samp(i,0);samp(i,H-1);}
for(var j=0;j<H;j+=2){samp(0,j);samp(W-1,j);}
function med(a){a.sort(function(m,q){return m-q;});return a[a.length>>1];}
var hasBg=false,br=0,bg=0,bb=0;
if(rs.length>n*0.3){br=med(rs);bg=med(gs);bb=med(bs);var ok=0;for(var m=0;m<rs.length;m++){if(Math.abs(rs[m]-br)+Math.abs(gs[m]-bg)+Math.abs(bs[m]-bb)<=T*2.5)ok++;}hasBg=ok>rs.length*0.7;}if(hasBg&&/^data:image\/png|\.png(\?|#|$)/i.test(p.src)){var fl=0;for(var m2=0;m2<rs.length;m2++){if(Math.abs(rs[m2]-br)+Math.abs(gs[m2]-bg)+Math.abs(bs[m2]-bb)<=4)fl++;}if(fl>=rs.length*0.99)T=5;}
if(!hasBg&&tr<n*0.3)return;
var N=W*H,bgm=new Uint8Array(N),st=new Int32Array(N),sp=0;
function isBg(k){var q=k*4;return d[q+3]<20||(hasBg&&Math.abs(d[q]-br)+Math.abs(d[q+1]-bg)+Math.abs(d[q+2]-bb)<=T);}
function push(k){if(!bgm[k]&&isBg(k)){bgm[k]=1;st[sp++]=k;}}
for(var a=0;a<W;a++){push(a);push((H-1)*W+a);}
for(var b=0;b<H;b++){push(b*W);push(b*W+W-1);}
while(sp>0){var k=st[--sp],kx=k%W,ky=(k-kx)/W;if(kx>0)push(k-1);if(kx<W-1)push(k+1);if(ky>0)push(k-W);if(ky<H-1)push(k+W);}
var lab=new Int32Array(N),comps=[],cid=0;
for(var q=0;q<N;q++){
if(bgm[q]||lab[q])continue;
cid++;var area=0,x0=W,y0=H,x1=-1,y1=-1;lab[q]=cid;sp=0;st[sp++]=q;
while(sp>0){var k2=st[--sp],cx=k2%W,cy=(k2-cx)/W;area++;if(cx<x0)x0=cx;if(cx>x1)x1=cx;if(cy<y0)y0=cy;if(cy>y1)y1=cy;
for(var dy=-1;dy<=1;dy++){for(var dx=-1;dx<=1;dx++){var nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;var nk=ny*W+nx;if(!bgm[nk]&&!lab[nk]){lab[nk]=cid;st[sp++]=nk;}}}}
comps[cid]={area:area,x0:x0,y0:y0,x1:x1,y1:y1};
}
var big=0;
for(var u=1;u<=cid;u++){if(!big||comps[u].area>comps[big].area)big=u;}
if(!big)return;
var minArea=Math.max(20,N*0.00004);
var keep=[],X0=W,Y0=H,X1=-1,Y1=-1;
for(var v=1;v<=cid;v++){var o=comps[v];var corner=o.x1<W*0.35&&o.y1<H*0.28;
if(v===big||(o.area>=minArea&&!corner)){keep[v]=1;if(o.x0<X0)X0=o.x0;if(o.y0<Y0)Y0=o.y0;if(o.x1>X1)X1=o.x1;if(o.y1>Y1)Y1=o.y1;}}
for(var e=0;e<N;e++){
var L=lab[e],ptr=e*4;
if(!L||!keep[L]){d[ptr+3]=0;continue;}
if(hasBg){var ex=e%W,ey=(e-ex)/W;
var edge=(ex>0&&bgm[e-1])||(ex<W-1&&bgm[e+1])||(ey>0&&bgm[e-W])||(ey<H-1&&bgm[e+W]);
if(edge){var ds=Math.abs(d[ptr]-br)+Math.abs(d[ptr+1]-bg)+Math.abs(d[ptr+2]-bb);
if(ds<T*1.6){d[ptr+3]=Math.round(d[ptr+3]*Math.max(0.5,(ds-T)/(T*0.6)));}}}
}
x.putImageData(im,0,0);
X0=Math.max(0,X0-2);Y0=Math.max(0,Y0-2);X1=Math.min(W-1,X1+2);Y1=Math.min(H-1,Y1+2);
var w=X1-X0+1,h=Y1-Y0+1;
if(w<20||h<20)return;
var o2=document.createElement('canvas');o2.width=w;o2.height=h;
o2.getContext('2d').drawImage(c,X0,Y0,w,h,0,0,w,h);
el.src=o2.toDataURL('image/png');sync();
}catch(err){}};
p.src=el.getAttribute('data-src')||el.src;
}
function sizeItems(){try{
var stg=document.querySelector('.mstage');if(!stg)return;
var SW=stg.clientWidth,SH=stg.clientHeight;if(!SW||!SH)return;
var its=stg.querySelectorAll('.pitem'),n=its.length,w=[],h=[],asp=[],Ls=DIMS.slice(),i,pod=document.body.classList.contains('podium');
for(i=0;i<n;i++){var im=its[i].querySelector('img.mp');if(!im||!im.naturalWidth||!im.naturalHeight)return;asp.push(im.naturalWidth/im.naturalHeight);}
function dim(){for(i=0;i<n;i++){if(asp[i]>=1){w[i]=Ls[i];h[i]=Ls[i]/asp[i];}else{h[i]=Ls[i];w[i]=Ls[i]*asp[i];}}}
/* Layouts (all items straight). Each one gives every item a centre x and a bottom y (upwards) in real-size units:
   row     - biggest item in the middle behind, the others in front on both sides, covering it by OV (28%) of its width
   stack   - items one behind the other, each one further back stands higher, so wide flat items (keyboard, mouse pad...) fill the box upwards
             (only when each front item is at least 55% as wide as the one behind it, so a small mouse is never put over a keyboard)
   pyramid - 3 items: the biggest behind on top, the other two side by side in front of it
   Every item is at least 26% of the box height long, and a wide item (keyboard, mouse pad) at least 42% of the box width wide, so it never looks tiny.
   The layout that fills the product box best wins; the row is kept unless another fills at least 15% more. Front items cover UP (35%) of the item behind. */
var OV=0.28,UP=0.35;
function area(i){return w[i]*h[i];}
/* The person's choice (front / middle / back) wins: USER is true when any product has one. Products without a choice
   count as middle. ORD() lists the products from the back to the front (ties: the bigger one further back). */
var USER=false;for(i=0;i<n;i++){if(LAY[i]>=0)USER=true;}
function lay(i){return LAY[i]>=0?LAY[i]:1;}
function ORD(){var o=[];for(var j=0;j<n;j++)o.push(j);o.sort(function(p,q){return (lay(p)-lay(q))||(area(q)-area(p));});return o;}
function rowPlan(){var b=0,mx=0,x=[],y=[],z=[],left=[],right=[],j;
for(i=0;i<n;i++){if(Ls[i]>mx)mx=Ls[i];}
if(USER){var ro=ORD();b=ro[0];}else if(n===3&&Ls[1]>=0.85*mx)b=1;else{for(i=0;i<n;i++){if(Ls[i]===mx){b=i;break;}}}
for(i=0;i<n;i++){y[i]=0;z[i]=(i===b?1:2);if(USER&&i!==b)z[i]=1+ORD().indexOf(i);if(i===b)continue;if(n===3){(left.length===0?left:right).push(i);}else{(i<b?left:right).push(i);}}
x[b]=0;var ov=OV*w[b];
for(j=0;j<left.length;j++){var L=left[j],o=Math.min(ov,0.6*w[L]);x[L]=-w[b]/2+o-w[L]/2;}
for(j=0;j<right.length;j++){var R=right[j],o2=Math.min(ov,0.6*w[R]);x[R]=w[b]/2-o2+w[R]/2;}
return {name:'row',x:x,y:y,z:z};}
function stackPlan(){var ord=[],x=[],y=[],z=[],j;for(i=0;i<n;i++)ord.push(i);
if(USER)ord=ORD();else ord.sort(function(p,q){return area(q)-area(p);});
var f=ord[n-1];y[f]=0;x[f]=0;z[f]=n;
var ok=true;for(j=n-2;j>=0;j--){var c=ord[j],fr=ord[j+1];if(w[fr]<0.55*w[c])ok=false;y[c]=Math.max(y[fr]+h[fr]-UP*h[c],y[fr]+0.18*h[fr]);x[c]=0;z[c]=j+1;}
return {name:'stack',x:x,y:y,z:z,bad:!ok};}
function pyramidPlan(){var hb=0,o=[],x=[],y=[],z=[];if(USER)hb=ORD()[0];else{for(i=1;i<n;i++){if(area(i)>area(hb))hb=i;}}
for(i=0;i<n;i++)if(i!==hb)o.push(i);
var a=o[0],c=o[1],g=-0.06*(w[a]+w[c])/2,tot=w[a]+w[c]+g,fh=Math.max(h[a],h[c]);
x[a]=-tot/2+w[a]/2;x[c]=tot/2-w[c]/2;y[a]=0;y[c]=0;z[a]=2;z[c]=2;
if(USER){var po=ORD();z[a]=1+po.indexOf(a);z[c]=1+po.indexOf(c);}
x[hb]=0;y[hb]=Math.max(fh-UP*h[hb],0.18*fh);z[hb]=1;
return {name:'pyramid',x:x,y:y,z:z};}
/* 4 versions of one product:
   grid    - two side by side in front, the other two side by side behind them, standing higher
   stagger - one behind the other like the stack, each one shifted a little left or right so every version shows */
function gridPlan(){var x=[],y=[],z=[],q=[0,1,2,3];
if(USER){var go=ORD();q=[go[2],go[3],go[0],go[1]];}
var A=q[0],B=q[1],C=q[2],D=q[3];
var g=-0.06*(w[A]+w[B])/2,tot=w[A]+w[B]+g,fh=Math.max(h[A],h[B]);
x[A]=-tot/2+w[A]/2;x[B]=tot/2-w[B]/2;y[A]=0;y[B]=0;z[A]=3;z[B]=3;
var g2=-0.06*(w[C]+w[D])/2,tot2=w[C]+w[D]+g2,bh=Math.max(h[C],h[D]);
x[C]=-tot2/2+w[C]/2;x[D]=tot2/2-w[D]/2;y[C]=y[D]=Math.max(fh-UP*bh,0.18*fh);z[C]=1;z[D]=2;
return {name:'grid',x:x,y:y,z:z};}
function staggerPlan(){var S=stackPlan(),ord=[],j;for(i=0;i<n;i++)ord.push(i);ord.sort(function(p,q){return S.z[q]-S.z[p];});
for(j=1;j<ord.length;j++){S.x[ord[j]]=(j%2?-1:1)*0.1*w[ord[j]];}S.name='stagger';return S;}
function fit(P){var mnX=1e9,mxX=-1e9,H=0,j,vis=0;
for(i=0;i<n;i++){mnX=Math.min(mnX,P.x[i]-w[i]/2);mxX=Math.max(mxX,P.x[i]+w[i]/2);H=Math.max(H,P.y[i]+h[i]);}
P.k=Math.min(SW*0.98/(mxX-mnX),SH*0.98/H);P.cx=(mnX+mxX)/2;P.H=H;
for(i=0;i<n;i++){var a2=area(i);for(j=0;j<n;j++){if(j===i||P.z[j]<=P.z[i])continue;
var ox=Math.min(P.x[i]+w[i]/2,P.x[j]+w[j]/2)-Math.max(P.x[i]-w[i]/2,P.x[j]-w[j]/2),oy=Math.min(P.y[i]+h[i],P.y[j]+h[j])-Math.max(P.y[i],P.y[j]);
if(ox>0&&oy>0)a2-=ox*oy;}vis+=Math.max(0,a2);}
P.score=vis*P.k*P.k/(SW*SH);return P;}
function plan(){dim();if(n===4){var A=[fit(gridPlan()),fit(staggerPlan()),fit(stackPlan())],B=A[0];for(var q4=1;q4<A.length;q4++){if(!A[q4].bad&&A[q4].score>B.score)B=A[q4];}return B;}
var R=fit(rowPlan()),best=R,c=[fit(stackPlan())];if(n===3)c.push(fit(pyramidPlan()));
for(var q=0;q<c.length;q++){if(!c[q].bad&&c[q].score>best.score)best=c[q];}
if(!USER&&best!==R&&best.score<R.score*1.15)best=R;return best;}
var P,it;
for(it=0;it<4;it++){P=plan();var bumped=false;
for(i=0;i<n;i++){var lg=Math.max(w[i],h[i])*P.k,mn=0.26*SH;if(w[i]>=1.6*h[i])mn=Math.max(mn,0.42*SW);if(lg<mn-0.5){Ls[i]=Ls[i]*mn/lg;bumped=true;}}
if(!bumped)break;}
P=plan();var k=P.k;
var gh=P.H*k,base=pod?0:(SH-gh)/2;stg.setAttribute('data-layout',P.name);
for(i=0;i<n;i++){
its[i].style.cssText='position:absolute;flex:none;min-width:0;margin:0;left:'+(SW/2+(P.x[i]-P.cx)*k-w[i]*k/2)+'px;bottom:'+(base+P.y[i]*k)+'px;width:'+(w[i]*k)+'px;height:'+(h[i]*k)+'px;z-index:'+P.z[i];}
}catch(e){}}
var els=document.querySelectorAll('img.mp');for(var q0=0;q0<els.length;q0++)setup(els[q0]);
var tick=setInterval(sizeItems,150);setTimeout(function(){clearInterval(tick);},6000);
})();</script>`.replace('__DIMS__', JSON.stringify(dims)).replace('__LAYERS__', JSON.stringify(layers));
h = h.replace('</body>', script + '</body>');
item.screenshot_request.html = h;
return { json: item };

