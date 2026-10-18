const L = {
  en: {
    title: 'Sanctuary Merchant', subtitle: 'Forge. Stack. Serve the champions.', play: 'Play', loading: 'Loading the sanctuary…', skip: 'Skip ›',
    blade: 'Rune Blade', flask: 'Flask of Vitality', shield: 'Tower Shield', tome: 'Spell Tome',
    padA: 'Armor Anvil', padB: 'Assistant Golem', padC: 'Mystic Scribe Bench', padD: 'Upgrade Desk', padE: 'Hall of Champions',
    padE_desc: '+50% gold from every sale', forge: 'Starter Forge', font: 'Mana Font', trash: 'Recycle',
    upgrades: 'Upgrade Desk', speed: 'Move Speed', capacity: 'Stack Capacity', craft: 'Crafting Speed', max: 'MAX', level: 'Lv',
    frenzy: '2× Frenzy', frenzyDesc: 'Watch an ad: double speed and instant crafting for 60s', hireGolem: 'Master Golem', hireGolemDesc: 'Watch an ad: a free master golem helps for 90s',
    adUnavailable: 'Ads are only available on CrazyGames.', frenzyOn: 'FRENZY!', golemHired: 'The Master Golem joins your shop!',
    unlocked: 'Unlocked!', full: 'Stack full', legendary: 'Legendary Sanctuary!', milestone500: '500 gold! Business is booming!',
    welcome: 'Grab Rune Blades from the forge and serve the champions at the counter!', hintMove: 'WASD / arrows or drag to move', mute: 'Sound', language: 'Language',
    berserker: 'Berserker', elementalist: 'Elementalist', juggernaut: 'Juggernaut', resume: 'Tap to resume', paused: 'Paused',
  },
  tr: {
    title: 'Sığınak Tüccarı', subtitle: 'Döv. Yığ. Şampiyonlara hizmet et.', play: 'Oyna', loading: 'Sığınak yükleniyor…', skip: 'Geç ›',
    blade: 'Rün Kılıcı', flask: 'Can Şişesi', shield: 'Kule Kalkanı', tome: 'Büyü Kitabı',
    padA: 'Zırh Örsü', padB: 'Yardımcı Golem', padC: 'Mistik Yazıcı Masası', padD: 'Geliştirme Masası', padE: 'Şampiyonlar Salonu',
    padE_desc: 'Her satıştan %50 fazla altın', forge: 'Başlangıç Ocağı', font: 'Mana Çeşmesi', trash: 'Geri dönüşüm',
    upgrades: 'Geliştirme Masası', speed: 'Hareket Hızı', capacity: 'Yığın Kapasitesi', craft: 'Üretim Hızı', max: 'MAKS', level: 'Sv',
    frenzy: '2× Çılgınlık', frenzyDesc: 'Reklam izle: 60 sn boyunca çift hız ve anında üretim', hireGolem: 'Usta Golem', hireGolemDesc: 'Reklam izle: 90 sn boyunca ücretsiz usta golem',
    adUnavailable: 'Reklamlar yalnızca CrazyGames üzerinde.', frenzyOn: 'ÇILGINLIK!', golemHired: 'Usta Golem dükkana katıldı!',
    unlocked: 'Açıldı!', full: 'Yığın dolu', legendary: 'Efsanevi Sığınak!', milestone500: '500 altın! İşler tıkırında!',
    welcome: 'Ocaktan Rün Kılıçlarını al ve tezgâhta şampiyonlara hizmet et!', hintMove: 'Hareket: WASD / ok tuşları veya sürükle', mute: 'Ses', language: 'Dil',
    berserker: 'Öfkeli Savaşçı', elementalist: 'Element Büyücüsü', juggernaut: 'Dev Zırhlı', resume: 'Devam etmek için dokun', paused: 'Duraklatıldı',
  },
};
export let lang = (() => { try { return localStorage.getItem('sanctuary_lang'); } catch { return null; } })() || ((navigator.language || 'en').startsWith('tr') ? 'tr' : 'en');
export const t = (k) => L[lang][k] ?? L.en[k] ?? k;
export function setLang(l) { lang = l; try { localStorage.setItem('sanctuary_lang', l); } catch {} document.documentElement.lang = l; dispatchEvent(new Event('langchange')); }
