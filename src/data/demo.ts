import { addDays, buildCaption, cairoNow } from './logic'
import type { CaptionTemplate, Data, Post, PostItem, Product } from './types'

// Sample data for demo mode (no Firebase configured). The products, prices and caption templates are
// a small copy of the real Posts sheet; the states are spread out so every screen has something to show.

const FOOTER = 'مول البستان - الدور العاشر - static📌\nلمعرفة جميع الأسعار وطلب المنتجات:-\nwww.static-eg.com 🌐\nشحن لجميع أنحاء مصر\nللمبيعات وأونلاين☎️:01223311744\nللصيانة و الدعم الفني☎️:01289488111\nرقم فرع البستان☎️:01272222829'

export const demoTemplates: CaptionTemplate[] = [
  { name: 'Default', text: `🔵 {name}\n🟠 {price} EGP\n${FOOTER}` },
  { name: 'black friday', text: `🔥STATIC FRIDAY🔥\n\n🔵 {name}\n❌ قبل: {before} EGP\n✅ دلوقتي: {price} EGP\nمول البستان - الدور العاشر - static📌\nلطلب المنتج: www.static-eg.com 🌐\nشحن لجميع أنحاء مصر\nللمبيعات وأونلاين☎️:01223311744\nhttps://wa.me/201223311744` },
  { name: 'Short', text: '🔵 {name}\n🟠 {price} EGP\nwww.static-eg.com 🌐\n☎️ 01223311744' },
]

export const demoStyles = ['Static', 'Static BlackFriday']

const P = (category: string, name: string, price: string, company: string): Product => ({ category, name, price, company })
export const demoProducts: Product[] = [
  P('MB', 'ASUS PRIME B550M-A', '4900', 'Asus Prime'),
  P('MB', 'ASUS PRIME B550M-K ARGB', '4200', 'Asus Prime'),
  P('MB', 'Asus Prime B550M-A Wi Fi II', '5500', 'Asus Prime'),
  P('MB', 'Asus Prime B850M-F', '5700', 'Asus Prime'),
  P('MB', 'ASUS PRIME B850M-F WIFI', '6600', 'Asus Prime'),
  P('MB', 'Asus Prime B650M-A II CSM', '6500', 'Asus Prime'),
  P('MB', 'ASUS PRIME H810M-A-CSM', '5000', 'Asus Prime'),
  P('MB', 'Gigabyte B860M D3HP', '6500', 'Gigabyte'),
  P('MB', 'Gigabyte B550 Gaming X V2', '6000', 'Gigabyte'),
  P('MB', 'ASUS TUF GAMING B850-E WIFI', '11500', 'Asus Tuf'),
  P('CPU', 'AMD Ryzen 5 7500F Tray', '7500', 'AMD'),
  P('CPU', 'AMD Ryzen 7 7800X3D tray', '18000', 'AMD'),
  P('CPU', 'Intel Core I5-14400F tray', '8000', 'Intel'),
  P('CPU', 'Intel Core I5-12400F Box', '7400', 'Intel'),
  P('CPU', 'Intel Core I7-14700KF Box', '19500', 'Intel'),
  P('VGA', 'ASUS Dual RTX 5060 OC Edition 8GB', '30000', 'Asus'),
  P('VGA', 'ASUS Dual RX 7600 8GB OC', '21000', 'Asus'),
  P('VGA', 'ASUS PRIME RTX 5070 Ti 16GB', '78000', 'Asus'),
  P('VGA', 'MSI RTX 5050 8G Shadow 2X', '22000', 'MSI'),
  P('Monitor', 'Lenovo Legion 25-1P 25″ FHD IPS 320Hz 0.5ms', '7500', 'Lenovo'),
  P('Monitor', 'MSI PRO MP276E18 27″ FHD IPS 180Hz 1ms', '6000', 'MSI'),
  P('Monitor', 'MSI MAG 276QE27 27" WQHD IPS 275Hz 0.5MS', '11500', 'MSI'),
  P('Monitor', 'ASUS TUF Gaming VG249QM5A 24″ FHD Fast IPS 240Hz 0.3ms', '6900', 'Asus'),
  P('Case', 'Asus Tuf Gaming GT502 Horizon TG ARGB White', '8500', 'Asus'),
  P('Case', 'ASUS TUF Gaming GT302 ARGB BLACK', '7000', 'Asus'),
  P('Case', 'Xigmatek Amun 3 Fan ARGB PWM Micro Tower Case', '1300', 'Xigmatek'),
  P('Case', 'Xigmatek Sun 5 Fan Argb PWM Super Tower Case', '3300', 'Xigmatek'),
  P('PSU', 'Asus Tuf Gaming 1200W 80+ Gold Full Modular ATX 3.1 PCIe 5.1', '8900', 'Asus Tuf'),
  P('PSU', 'Xigmatek Thor T850M V3 850W 80 Plus Bronze ATX 3.1 PCI E 5.1 Full Modular', '3100', 'Xigmatek'),
  P('PSU', 'Lian Li RS1000G 1000W 80 Plus Gold ATX 3.1 Full Modular White', '7300', 'Lian Li'),
  P('Cooler', 'Cooler Master Master Liquid 360L Core White', '3500', 'Cooler Master'),
  P('Case Fans', 'Xigmatek Starlink Ultra II', '1300', 'Xigmatek'),
  P('Acc', 'Fantech GP13 II gamepad', '950', 'Fantech'),
  P('Acc', 'Metaphyuni Metapanda Mouse Pad', '350', 'MetaPanda'),
  P('Acc', 'Metaphyuni Metapanda WristPad', '250', 'MetaPanda'),
  P('Acc', 'MAZE M252 Monitor Arm', '1500', 'MAZE'),
  P('Acc', 'Jedel WKL-68 RGB 60% Wired Magnetic Hall Effect', '2000', 'Jedel'),
  P('Acc', 'Jedel WD155 7D Dual-Mode Wireless Charging Mouse', '600', 'Jedel'),
  P('Acc', 'Metal Laptop Stand 7 Height Levels', '199', ''),
]

const item = (category: string, name: string): PostItem => ({ category, name, manualPhoto: '', nextPhoto: false })

/** Marks a poster link as a drawn sample: the app shows a placeholder poster for it. */
export const DEMO_POSTER = 'demo:poster'

export function demoPosts(): Post[] {
  const today = cairoNow().date
  const d = (n: number) => addDays(today, n)
  let n = 0
  const post = (items: PostItem[], company: string, before: string, after: string, style: string, over: Partial<Post> = {}): Post => ({
    id: `demo-${++n}`, order: n, items, company, priceBefore: before, priceAfter: after, style, details: '', posterUrl: DEMO_POSTER, photoStatus: 'OK',
    feedback: '', postDate: '', postTime: '', scheduledFor: '', caption: '', captionStyle: style.includes('Friday') ? 'black friday' : '', fbStatus: '', igStatus: '', fbPostId: '', createdAt: Date.now() - n * 60000, ...over,
  })
  const posted = (date: string, time: string): Partial<Post> => ({ feedback: 'Done', postDate: date, postTime: time, scheduledFor: `${date} ${time}`, fbStatus: 'Published', igStatus: `Published ${date} ${time}`, fbPostId: '242283423247894_0' })
  const scheduled = (date: string, time: string, auto = false): Partial<Post> => ({ feedback: 'Done', postDate: auto ? '' : date, postTime: auto ? '' : time, scheduledFor: `${date} ${time}`, fbStatus: 'Scheduled' })
  return [
    // Needs fixing
    post([item('Monitor', 'MSI MAG 276QE27 27" WQHD IPS 275Hz 0.5MS'), { ...item('Acc', 'MAZE M252 Monitor Arm'), photoMissing: true }], 'MSI + MAZE', '13,000', '', 'Static', { posterUrl: '', photoStatus: 'MISSING' }),
    post([item('MB', 'Gigabyte B860M D3HP'), item('CPU', 'Intel Core I5-14400F tray')], 'Gigabyte + Intel', '14,500', '13,499', 'Static BlackFriday', { posterUrl: '', photoStatus: 'AI ERROR' }),
    post([item('Case', 'Xigmatek Sun 5 Fan Argb PWM Super Tower Case')], 'Xigmatek', '3,300', '', 'Static', { feedback: 'Done', postDate: today, postTime: '09:00', fbStatus: 'Post time must be at least 15 minutes ahead' }),
    // Being built
    post([item('VGA', 'ASUS Dual RTX 5060 OC Edition 8GB')], 'Asus', '30,000', '28,999', 'Static BlackFriday', { posterUrl: '', photoStatus: '' }),
    // Waiting for review
    post([item('Monitor', 'Lenovo Legion 25-1P 25″ FHD IPS 320Hz 0.5ms')], 'Lenovo', '7,500', '', 'Static'),
    post([item('MB', 'ASUS PRIME H810M-A-CSM')], 'Asus Prime', '5,000', '4,799', 'Static'),
    post([item('PSU', 'Lian Li RS1000G 1000W 80 Plus Gold ATX 3.1 Full Modular White')], 'Lian Li', '7,300', '', 'Static'),
    post([item('MB', 'ASUS TUF GAMING B850-E WIFI'), item('CPU', 'AMD Ryzen 7 7800X3D tray')], 'Asus Tuf + AMD', '29,500', '27,499', 'Static BlackFriday'),
    post([item('Acc', 'Jedel WD155 7D Dual-Mode Wireless Charging Mouse')], 'Jedel', '600', '', 'Static'),
    // Scheduled
    post([item('Case', 'Asus Tuf Gaming GT502 Horizon TG ARGB White')], 'Asus', '8,500', '', 'Static', scheduled(today, '17:00', true)),
    post([item('MB', 'Asus Prime B650M-A II CSM')], 'Asus Prime', '6,500', '5,899', 'Static', scheduled(today, '17:15', true)),
    post([item('PSU', 'Asus Tuf Gaming 1200W 80+ Gold Full Modular ATX 3.1 PCIe 5.1')], 'Asus Tuf', '8,900', '', 'Static', scheduled(d(1), '12:00')),
    post([item('Monitor', 'MSI PRO MP276E18 27″ FHD IPS 180Hz 1ms')], 'MSI', '6,000', '5,499', 'Static BlackFriday', scheduled(d(1), '17:00', true)),
    post([item('Acc', 'Metal Laptop Stand 7 Height Levels')], '', '199', '', 'Static', scheduled(d(3), '20:00')),
    // Posted
    post([item('Monitor', 'ASUS TUF Gaming VG249QM5A 24″ FHD Fast IPS 240Hz 0.3ms')], 'Asus', '6,900', '6,199', 'Static BlackFriday', posted(d(-1), '16:00')),
    post([item('Acc', 'Jedel WKL-68 RGB 60% Wired Magnetic Hall Effect')], 'Jedel', '2,000', '1,499', 'Static BlackFriday', posted(d(-1), '18:00')),
    post([item('Acc', 'MAZE M252 Monitor Arm')], 'MAZE', '1,500', '899', 'Static BlackFriday', posted(d(-2), '14:00')),
    post([item('Cooler', 'Cooler Master Master Liquid 360L Core White')], 'Cooler Master', '3,500', '2,799', 'Static BlackFriday', posted(d(-2), '12:00')),
    post([item('Acc', 'Metaphyuni Metapanda Mouse Pad'), item('Acc', 'Metaphyuni Metapanda WristPad')], 'MetaPanda', '600', '333', 'Static BlackFriday', posted(d(-3), '17:15')),
    post([item('Acc', 'Fantech GP13 II gamepad')], 'Fantech', '950', '599', 'Static BlackFriday', posted(d(-3), '17:00')),
  ]
}

export const demoData = (): Data => ({ loaded: true, posts: demoPosts().map((p) => (p.posterUrl ? { ...p, caption: buildCaption(p, demoTemplates) } : p)), products: demoProducts, styles: demoStyles, templates: demoTemplates, health: { lastSync: Date.now(), note: 'demo' } })
