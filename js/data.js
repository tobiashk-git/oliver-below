/* All content and every tuning number lives here. */
'use strict';

/* ---------- difficulty curves (f = floor, 1-24, endless beyond) ---------- */
// the middle floors are where good runs end; floors 3-5 teach; the endless floors compound
const HUMP = (f, a) => (1 + a * Math.exp(-(((f - 11.5) / 4.2) ** 2)) + .07 * Math.exp(-(((f - 4) / 1.6) ** 2))) * (f > 24 ? Math.pow(1.06, f - 24) : 1);
const K = {
  mhp: f => (12 + 4.6 * f + 0.25 * f * f) * HUMP(f, .12),
  matk: f => (3.2 + 1.85 * f + 0.095 * f * f) * HUMP(f, .17),
  mdef: f => 0.4 + 0.62 * f,
  xp: f => 6 + 2.2 * f,
  need: l => Math.round(34 + 21 * l + 3.1 * l * l),
  baseHp: 34, hpLvl: 6.2, baseMp: 10, mpLvl: 1.3, baseAtk: 4.5, atkLvl: 0.95,
  regen: 250,            // turns for a full natural heal
  mpRegen: 230,
  hungerMax: 1400, hungerStart: 1200,
  wander: 150,           // a wandering monster roughly every N turns
  weaponAtk: [3, 5.5, 8.5, 12, 16, 21],
  armour: { body: [2, 3.6, 5.6, 8, 11, 14.5], head: [1, 1.8, 2.8, 4, 5.4, 7], hands: [.6, 1.2, 1.9, 2.7, 3.7, 4.9], legs: [1, 1.8, 2.8, 4, 5.4, 7], feet: [.6, 1.2, 1.9, 2.7, 3.7, 4.9] },
  plusW: t => 0.9 + 0.45 * t, plusA: t => 0.5 + 0.22 * t,
};

/* ---------- zones ---------- */
const ZONES = [
  { id: 'barrow', name: 'The Ancient Barrow', sub: 'Where every adventurer starts, and most nap.', pool: ['rat', 'rat', 'bat', 'skeleton', 'spider', 'ghost'], music: 'dungeon', light: [255, 190, 110], fog: '#0b0806', props: ['barrel', 'rock', 'obelisk'], liquid: null, boss: 'warden0' },
  { id: 'ice', name: 'Frostpeak Ice Caves', sub: 'Mind the cold. It minds you.', pool: ['wraith', 'wolf', 'wolf', 'sentinel', 'bat', 'ghost'], music: 'frostpeak', light: [170, 215, 255], fog: '#060a12', props: ['crystal', 'boulder', 'rock'], liquid: 'ice', boss: 'revenant' },
  { id: 'grove', name: 'Verdantwood Grove', sub: 'The roots remember who stepped on them.', pool: ['spirit', 'bandit', 'fauna', 'spider', 'fauna'], music: 'verdantwood', light: [215, 240, 150], fog: '#050a05', props: ['bush', 'log', 'mush'], liquid: 'fern', boss: 'bramble' },
  { id: 'caldera', name: 'Emberfall Caldera', sub: 'The floor is occasionally lava.', pool: ['slime', 'drake', 'golem', 'slime', 'bandit'], music: 'badlands', light: [255, 160, 90], fog: '#0d0503', props: ['tumble', 'rock', 'geyser'], liquid: 'lava', boss: 'cinder' },
  { id: 'temple', name: 'Gloomfen Sunken Temple', sub: 'Something large is breathing down here.', pool: ['hag', 'insect', 'undead', 'insect', 'spirit'], music: 'gloomfen', light: [170, 225, 180], fog: '#040807', props: ['fern', 'mush', 'obelisk'], liquid: 'mud', boss: 'bogmaw' },
  { id: 'castle', name: "The Warden's Castle", sub: 'The last light in the valley went out here.', pool: ['undead', 'skeleton', 'sentinel', 'golem', 'wraith', 'drake', 'hag'], music: 'dungeon', light: [200, 180, 255], fog: '#07060c', props: ['barrel', 'table', 'obelisk'], liquid: null, boss: 'ancient' },
];
const FLOORS_PER_ZONE = 4, WIN_FLOOR = ZONES.length * FLOORS_PER_ZONE;
const MINIBOSS = { 6: 'thornback', 10: 'thornback', 18: 'bonelord', 22: 'royal' };

/* ---------- creatures: multipliers on the floor curves ---------- */
const MON = {
  rat: { n: 'Dungeon Rat', art: 'dungeon_rat', h: .78, hp: .62, atk: .72, def: .3, xp: .6, pack: [2, 3], on: ['poison', .12, 4], d: 'Never alone, rarely polite. Its bite can poison.' },
  bat: { n: 'Cave Bat', art: 'cave_bat', h: .66, hp: .5, atk: .75, def: .2, xp: .6, spd: 150, erratic: .35, fly: 1, d: 'Fast and flighty. Corner it or wait for it to come to you.' },
  skeleton: { n: 'Skeleton', art: 'skeleton', h: 1.15, hp: .95, atk: .9, def: 1.6, xp: 1, d: 'Slow to die behind that shield. A pick goes straight through it.' },
  spider: { n: 'Giant Spider', art: 'giant_spider', h: .78, hp: .75, atk: .88, def: .6, xp: 1, shot: { kind: 'web', range: 5, cd: 6, mul: 0, st: ['root', 3] }, on: ['poison', .25, 4], d: 'Spits webs from afar, then comes to collect.' },
  ghost: { n: 'Ghost', art: 'ghost', h: .95, hp: .65, atk: .9, def: .2, xp: 1.1, phase: 1, fly: 1, dodge: .2, on: ['silence', .2, 5], d: 'Drifts through walls. Hard to hit, easily ignored until it is not.' },
  wraith: { n: 'Ice Wraith', art: 'ice_wraith', h: 1.05, hp: .85, atk: .95, def: .6, xp: 1.2, shot: { kind: 'frost', range: 6, cd: 4, mul: .8, st: ['chill', 4] }, keep: 3, d: 'Throws cold from a distance and backs away. Break line of sight.' },
  wolf: { n: 'Frost Wolf', art: 'frost_wolf', h: .98, hp: .78, atk: .9, def: .4, xp: .9, spd: 130, pack: [2, 2], d: 'Hunts in pairs and outruns you. Fight with your back in a doorway.' },
  sentinel: { n: 'Stone Sentinel', art: 'stone_sentinel', h: 1.2, hp: 1.25, atk: 1.06, def: 2.2, xp: 1.4, spd: 75, dormant: 1, d: 'Sits like a statue until you stand next to it. Slow.' },
  spirit: { n: 'Forest Spirit', art: 'forest_spirit', h: 1, hp: .8, atk: .9, def: .5, xp: 1.1, blink: 5, on: ['confuse', .25, 3], d: 'Blinks about and muddles your feet.' },
  bandit: { n: 'Bandit', art: 'bandit', h: 1.02, hp: .95, atk: .95, def: .9, xp: 1.1, thief: 1, spd: 110, d: 'Takes your gold and legs it. Catch him to get it back.' },
  fauna: { n: 'Corrupted Fauna', art: 'corrupted_fauna', h: 1.25, hp: 1.1, atk: .9, def: .7, xp: 1.1, enrage: 1, d: 'Placid enough, until it is half beaten. Then it is furious.' },
  slime: { n: 'Magma Slime', art: 'magma_slime', h: .9, hp: 1.05, atk: .85, def: .3, xp: .9, split: 1, fire: 1, on: ['burn', .25, 3], d: 'Hit it and it becomes two smaller problems.' },
  drake: { n: 'Fire Drake', art: 'fire_drake', h: 1.12, hp: 1, atk: 1.05, def: .9, xp: 1.4, fire: 1, moves: [['line', 5, 1.25, 'burn']], mcd: 4, d: 'Draws breath before it breathes fire. Step off the marked tiles.' },
  golem: { n: 'Ash Golem', art: 'ash_golem', h: 1.28, hp: 1.5, atk: 1.15, def: 1.5, xp: 1.5, spd: 70, fire: 1, moves: [['slam', 1, 1.7]], mcd: 3, d: 'Raises both fists before it slams. You have one turn to be elsewhere.' },
  hag: { n: 'Swamp Hag', art: 'swamp_hag', h: 1.12, hp: .95, atk: .9, def: .8, xp: 1.4, shot: { kind: 'hex', range: 6, cd: 5, mul: .6, st: ['weak', 5] }, caller: 8, keep: 2, d: 'Hexes you, then calls in her friends. Deal with her first.' },
  insect: { n: 'Giant Insect', art: 'giant_insect', h: 1.02, hp: .7, atk: .8, def: .6, xp: .9, spd: 130, fly: 1, pack: [1, 2], on: ['poison', .2, 4], d: 'Quick, venomous and fond of company.' },
  undead: { n: 'Spectral Undead', art: 'spectral_undead', h: 1.1, hp: 1.1, atk: 1, def: .6, xp: 1.3, drain: .5, d: 'Every hit it lands makes it healthier.' },
  /* ---- bosses: hp/atk are against the floor they guard ---- */
  warden0: { n: 'The Barrow Warden', art: 'golden_plains_boss', h: 1.75, hp: 4.6, atk: 1.19, def: 1.4, xp: 7, boss: 1, moves: [['slam', 1, 1.98], ['line', 5, 1.72], ['summon', 'rat', 2]], mcd: 3, d: 'Keeper of the barrow. Swings wide, so do not stand wide.' },
  revenant: { n: 'The Glacial Revenant', art: 'frostpeak_boss', h: 1.8, hp: 4.8, atk: 1.14, def: 1.4, xp: 7, boss: 1, moves: [['nova', 2, 1.58, 'chill'], ['line', 7, 1.78, 'chill'], ['rain', 7, 1.58, 'chill']], mcd: 3, d: 'Old as the ice, and about as warm.' },
  thornback: { n: 'Thornback Warden', art: 'verdantwood_maze_guardian_1', h: 1.55, hp: 3.0, atk: 1.14, def: 1.3, xp: 4, boss: 1, mini: 1, moves: [['charge', 6, 1.98], ['slam', 1, 1.85]], mcd: 3, d: 'Charges in a straight line. Straight lines can be stepped out of.' },
  bramble: { n: 'Elder Bramblewood', art: 'verdantwood_boss', h: 1.8, hp: 5.1, atk: 1.12, def: 1.3, xp: 7, boss: 1, moves: [['rain', 8, 1.52, 'root'], ['summon', 'spirit', 2], ['slam', 1, 1.98]], mcd: 3, d: 'The rot at the heart of the wood. Roots first, questions never.' },
  cinder: { n: 'Cinderjaw', art: 'badlands_boss', h: 1.85, hp: 5.1, atk: 1.17, def: 1.3, xp: 7, boss: 1, fire: 1, moves: [['cone', 5, 1.72, 'burn'], ['charge', 6, 1.98], ['rain', 9, 1.45, 'burn']], mcd: 3, d: 'Breathes in. Then, regrettably, out.' },
  bonelord: { n: 'The Bone Lord', art: 'dungeon_boss', h: 1.6, hp: 3.2, atk: 1.12, def: 1.6, xp: 4, boss: 1, mini: 1, moves: [['summon', 'skeleton', 2], ['line', 6, 1.85]], mcd: 4, d: 'He has plenty of bones, and no shortage of staff.' },
  bogmaw: { n: 'The Bogmaw', art: 'gloomfen_boss', h: 1.75, hp: 5.5, atk: 1.14, def: 1.2, xp: 7, boss: 1, moves: [['pull', 7, .5], ['slam', 1, 2.24], ['rain', 9, 1.45, 'poison']], mcd: 3, d: 'Its tongue is longer than the room. Its patience is not.' },
  royal: { n: 'The Royal Wraith', art: 'castle_boss', h: 1.65, hp: 3.3, atk: 1.17, def: 1.2, xp: 4, boss: 1, mini: 1, fly: 1, moves: [['warp', 0, 1.58], ['nova', 2, 1.58, 'silence']], mcd: 3, d: 'Courteous, crowned, and suddenly behind you.' },
  ancient: { n: 'The Ancient Warden', art: 'final_boss', h: 2.1, hp: 6.6, atk: 1.19, def: 1.5, xp: 12, boss: 1, moves: [['slam', 2, 1.98], ['cone', 6, 1.72, 'burn'], ['summon', 'sentinel', 2], ['rain', 11, 1.58, 'chill'], ['line', 9, 1.98]], mcd: 2, d: 'It slept beneath the valley before there was a valley.' },
};

/* ---------- statuses ---------- */
const STATUS = {
  poison: { n: 'Poisoned', c: '#7ccf4a', bad: 1 }, burn: { n: 'Burning', c: '#ff8a3c', bad: 1 }, chill: { n: 'Chilled', c: '#8fd3ff', bad: 1 }, root: { n: 'Rooted', c: '#9ac060', bad: 1 },
  sleep: { n: 'Asleep', c: '#a9b8ff', bad: 1 }, confuse: { n: 'Confused', c: '#e59bff', bad: 1 }, silence: { n: 'Silenced', c: '#c0c0d8', bad: 1 }, weak: { n: 'Weakened', c: '#c28a6a', bad: 1 }, stun: { n: 'Stunned', c: '#ffe27a', bad: 1 },
  might: { n: 'Might', c: '#ff7a6a' }, haste: { n: 'Haste', c: '#ffe27a' }, ward: { n: 'Warded', c: '#cfd8e8' }, stone: { n: 'Stoneskin', c: '#b9b1a4' }, hidden: { n: 'Unseen', c: '#9a8fd0' },
};

/* ---------- gear ---------- */
const TIERS = ['Wooden', 'Frost', 'Ironwood', 'Ember', 'Bog-iron', 'Royal'];
const ARMNAME = { body: ['Leather Armor', 'Frostweave Coat', 'Ironwood Mail', 'Ember Plate', 'Bog-iron Harness', 'Royal Plate'], head: ['Leather Cap', 'Frost Helm', 'Ironwood Helm', 'Ember Helm', 'Bog-iron Helm', 'Royal Helm'], hands: ['Leather Gloves', 'Frost Gloves', 'Ironwood Gloves', 'Ember Gloves', 'Bog-iron Gloves', 'Royal Gauntlets'], legs: ['Leather Greaves', 'Frost Greaves', 'Ironwood Greaves', 'Ember Greaves', 'Bog-iron Greaves', 'Royal Greaves'], feet: ['Leather Boots', 'Frost Boots', 'Ironwood Boots', 'Ember Boots', 'Bog-iron Boots', 'Royal Boots'] };
const SLOTS = ['weapon', 'body', 'head', 'hands', 'legs', 'feet', 'charm'];
const WEAPONS = {
  blade: { n: 'Blade', mul: 1, d: 'Balanced. +10% critical chance.', crit: .10 },
  pick: { n: 'Pick', mul: .95, d: 'Ignores 70% of armour.', pierce: .7 },
  cleaver: { n: 'Cleaver', mul: .9, d: 'Also hits everything else next to you for 60%.', cleave: .6 },
  great: { n: 'Greatsword', mul: 1.5, d: 'Huge hits, but each swing takes a turn and a half.', cost: 150 },
  spear: { n: 'Spear', mul: .92, d: 'Reaches two tiles. Tap an enemy a step away to strike first.', reach: 2 },
};
const SETS = [
  { n: 'Leather', d3: '+8% dodge', d5: '+16% dodge' }, { n: 'Frost', d3: 'Attackers may be chilled', d5: 'and half damage from fire and cold' },
  { n: 'Ironwood', d3: 'Heal 40% faster', d5: 'Heal 100% faster' }, { n: 'Ember', d3: 'Hits may set alight', d5: '+12% damage too' },
  { n: 'Bog-iron', d3: 'Reflect 20% of damage', d5: 'Reflect 40% of damage' }, { n: 'Royal', d3: '+10% max HP', d5: '+20% max HP, +10% damage' },
];
const AFFIX = {
  vigor: { n: 'of Vigour', t: v => `+${v} max HP`, r: f => 4 + f * 1.2 }, keen: { n: 'of Keenness', t: v => `+${v}% crit`, r: f => 4 + f * .25 }, light: { n: 'of Light Feet', t: v => `+${v}% dodge`, r: f => 3 + f * .2 },
  mind: { n: 'of the Owl', t: v => `+${v} max MP`, r: f => 2 + f * .35 }, leech: { n: 'of the Leech', t: v => `heal ${v}% of damage dealt`, r: f => 3 + f * .15 }, thorn: { n: 'of Thorns', t: v => `reflect ${v} damage`, r: f => 1 + f * .4 },
  might: { n: 'of Might', t: v => `+${v}% damage`, r: f => 5 + f * .35 }, ward: { n: 'of Warding', t: v => `${v}% to resist ailments`, r: f => 14 + f * .6 }, gold: { n: 'of Fortune', t: v => `+${v}% gold`, r: f => 20 + f },
};
const CHARMS = {
  ward: { n: 'Charm of Warding', ic: 'charm_of_warding', d: '60% to shrug off poison, curses and the like.' }, fury: { n: 'Charm of Fury', ic: 'charm0', d: '+30% damage below half health.' },
  echo: { n: 'Charm of Echoes', ic: 'charm1', d: 'Mana returns twice as fast.' }, luck: { n: 'Charm of Fortune', ic: 'charm2', d: '+60% gold, and better finds in chests.' },
  veil: { n: 'Charm of the Veil', ic: 'charm3', d: 'Sleeping monsters notice you far less.' }, moss: { n: 'Charm of Moss', ic: 'charm4', d: 'Regain 3% health for each foe put to sleep.' },
};

/* ---------- consumables ---------- */
const POTIONS = {
  heal: { n: 'Healing Potion', ic: 'healing_potion', known: 1, w: 11, v: 34, d: 'Restores 45% of your health.' }, mana: { n: 'Mana Potion', ic: 'mana_potion', known: 1, w: 9, v: 20, d: 'Restores 60% of your mana.' }, antidote: { n: 'Antidote', ic: 'antidote', known: 1, w: 8, v: 12, d: 'Cures every ailment.' },
  might: { n: 'Potion of Might', w: 7, v: 30, d: '+50% damage for 20 turns.' }, haste: { n: 'Potion of Haste', w: 7, v: 34, d: 'Two actions a turn for 12 turns.' }, stone: { n: 'Potion of Stoneskin', w: 7, v: 30, d: 'Half damage for 18 turns.' }, vanish: { n: 'Potion of Vanishing', w: 6, v: 30, d: 'Monsters lose you for 14 turns.' }, sight: { n: 'Potion of Sight', w: 6, v: 20, d: 'Shows every monster and item on the floor.' },
  fire: { n: 'Potion of Liquid Fire', w: 8, v: 24, d: 'Throw it: burns a 3x3 area. Drinking is inadvisable.', bad: 1, thr: 1 }, doze: { n: 'Potion of Dozing', w: 7, v: 24, d: 'Throw it: sends a 3x3 area to sleep. Or nod off yourself.', bad: 1, thr: 1 }, vigor: { n: 'Potion of Vigour', w: 2.5, v: 80, d: '+8% maximum health, for good.' },
};
const SCROLLS = {
  forge: { n: 'Scroll of Forging', known: 1, w: 13, v: 45, d: 'Improve one worn piece of gear by +1.' }, blink: { n: 'Scroll of Blinking', w: 10, v: 24, d: 'Whisks you to a random spot a safe way off.' }, map: { n: 'Scroll of Mapping', w: 9, v: 24, d: 'Draws the whole floor.' },
  lull: { n: 'Scroll of Lullaby', w: 8, v: 34, d: 'Every monster in sight falls asleep.' }, storm: { n: 'Scroll of Storms', w: 8, v: 34, d: 'Lightning strikes every monster in sight.' }, ward: { n: 'Scroll of Warding', w: 7, v: 28, d: 'A shield that soaks up 35% of your health.' }, howl: { n: 'Scroll of Howling', w: 6, v: 8, d: 'Calls every monster on the floor. Oops.', bad: 1 }, feast: { n: 'Scroll of Plenty', w: 4, v: 20, d: 'Conjures two warm pasties.' },
};
const SCROLL_WORDS = ['ZENNOR', 'TREGONY', 'MOUSEHOLE', 'PADSTOW', 'LOOE', 'FOWEY', 'TINTAGEL', 'BUDE', 'MEVA', 'PERRAN', 'LANYON', 'CARN'];

/* ---------- spells (from tomes) ---------- */
const SPELLS = {
  fire: { n: 'Fireball', ic: 'fireball', mp: 4, tgt: 1, range: 7, d: l => `Burst for ${Math.round(150 + 30 * l)}% damage around the target and set it alight.` },
  heal: { n: 'Heal', ic: 'heal', mp: 6, d: l => `Restore ${22 + 6 * l}% of your health and clear ailments.` },
  frost: { n: 'Frost Nova', ic: 'frost_shard', mp: 5, d: l => `${Math.round(70 + 20 * l)}% damage to everything within 2 tiles, and chill it.` },
  blink: { n: 'Blink', ic: 'tome_blink', mp: 5, tgt: 2, range: 5, d: l => `Step through space to any tile you can see within ${4 + l}.` },
  sleep: { n: 'Slumber', ic: 'zzz', mp: 4, tgt: 1, range: 6, d: l => `Put one monster to sleep for ${6 + 2 * l} turns. Your next hit on it is doubled.` },
  storm: { n: 'Chain Spark', ic: 'tome_storm', mp: 5, tgt: 1, range: 6, d: l => `${Math.round(95 + 20 * l)}% damage, leaping to ${1 + l} more monsters.` },
  ward: { n: 'Ward', ic: 'tome_ward', mp: 5, d: l => `A shield worth ${14 + 6 * l}% of your health.` },
  root: { n: 'Briar Grasp', ic: 'tome_root', mp: 4, tgt: 1, range: 7, d: l => `Root a 3x3 patch for ${3 + l} turns, with ${Math.round(40 + 15 * l)}% damage.` },
  sling: { n: 'Slingshot', ic: 'stone', mp: 2, tgt: 1, range: 7, d: l => `A cheap shot for ${Math.round(80 + 15 * l)}% damage.` },
};

/* ---------- perks: pick 1 of 3 each level ---------- */
const PERKS = {
  arm: { n: 'Strong Arm', max: 6, ic: 'blade3', d: '+9% damage' }, hide: { n: 'Thick Skin', max: 6, ic: 'body2', d: '+10% armour, +1' }, hearty: { n: 'Hearty', max: 6, ic: 'healing_potion', d: '+9% max health' }, eye: { n: 'Keen Eye', max: 4, ic: 'spear1', d: '+6% critical chance' }, feet: { n: 'Light Feet', max: 4, ic: 'feet1', d: '+5% dodge' },
  scholar: { n: 'Scholar', max: 4, ic: 'tome_frost', d: '+5 max MP, spells 14% stronger' }, nibble: { n: 'Second Breakfast', max: 3, ic: 'pasty', d: 'Heal 4% of damage you deal' }, riposte: { n: 'Riposte', max: 2, ic: 'blade1', d: '35% to strike back when you dodge or are missed' }, brawler: { n: 'Brawler', max: 2, ic: 'cleaver2', d: '+14% damage per extra foe beside you' }, duel: { n: 'Duellist', max: 2, ic: 'blade5', d: '+16% damage to a lone foe' },
  first: { n: 'First Strike', max: 2, ic: 'spear3', d: '+50% damage to unhurt foes' }, finish: { n: 'Finisher', max: 2, ic: 'great0', d: '+40% damage to foes under a third health' }, forager: { n: 'Forager', max: 2, ic: 'pasty', d: 'Hunger 35% slower; pasties heal 15%' }, alch: { n: 'Alchemist', max: 2, ic: 'pot5', d: 'Potions work 35% better' }, breath: { n: 'Not Today', max: 1, ic: 'angel_feather', d: 'Once per floor, survive a final blow with a quarter of your health' },
  moment: { n: 'Momentum', max: 2, ic: 'feet3', d: '+25% damage on the turn after you move' }, steady: { n: 'Steady', max: 2, ic: 'legs4', d: 'Waiting a turn gives +40% damage on the next hit' }, medit: { n: 'Meditation', max: 2, ic: 'mana_potion', d: 'Mana returns 60% faster' }, scav: { n: 'Scavenger', max: 2, ic: 'gold', d: 'Monsters drop 35% more' }, trap: { n: 'Careful Step', max: 1, ic: 'feet0', d: 'See traps before you tread on them' },
  tough: { n: 'Iron Stomach', max: 2, ic: 'antidote', d: '35% to resist ailments' }, haggle: { n: 'Haggler', max: 1, ic: 'gold', d: 'Everything costs a third less' }, thorns: { n: 'Prickly', max: 3, ic: 'bog_iron', d: 'Reflect 12% of melee damage' }, guard: { n: 'Boss Breaker', max: 2, ic: 'skull', d: '+18% damage to bosses, -10% from them' },
};

/* ---------- kits: sideways starts, unlocked by depth ---------- */
const KITS = {
  wanderer: { n: 'Wanderer', port: 'oliver', by: 'Oliver', need: 0, d: 'A blade, a jerkin, two potions and a Heal tome. A bit of everything.', weapon: 'blade', spells: ['heal'], items: [['potion', 'heal', 2], ['food', 'pasty', 1]] },
  ranger: { n: "Ranger's Kit", port: 'frostpeak_ranger', by: 'the Frostpeak Ranger', need: 5, d: 'A spear to strike first, and a slingshot to strike sooner than that.', weapon: 'spear', spells: ['sling'], items: [['potion', 'heal', 1], ['throw', 'stone', 5], ['food', 'pasty', 1]], perk: 'eye' },
  druid: { n: "Druid's Kit", port: 'forest_druid', by: 'the Forest Druid', need: 9, d: 'Less health, more magic. Briars hold them, fire does the rest.', weapon: 'blade', spells: ['root', 'fire'], items: [['potion', 'mana', 2], ['food', 'pasty', 1]], perk: 'scholar', hp: .85, mp: 8 },
  prospector: { n: "Prospector's Kit", port: 'badlands_prospector', by: 'the Badlands Prospector', need: 13, d: 'A pick that ignores armour and a pack of liquid fire.', weapon: 'pick', spells: [], items: [['potion', 'heal', 1], ['potion', 'fire', 3], ['food', 'pasty', 2]], perk: 'scav', gold: 60 },
  guide: { n: "Marsh Guide's Kit", port: 'marsh_guide', by: 'the Marsh Guide', need: 17, d: 'Blink, strike from behind, be gone. Little armour.', weapon: 'blade', spells: ['blink', 'sleep'], items: [['potion', 'vanish', 2], ['food', 'pasty', 1]], perk: 'first', hp: .9 },
  smith: { n: "Blacksmith's Kit", port: 'village_blacksmith', by: 'the Village Blacksmith', need: 24, d: 'A greatsword taller than you are and three forging scrolls.', weapon: 'great', spells: [], items: [['scroll', 'forge', 3], ['potion', 'heal', 1], ['food', 'pasty', 1]], perk: 'arm' },
};

const BOONS = [
  { id: 'b_blood', n: 'Blood for Iron', d: '-8% max health, +14% damage', f: p => { p.mul.hp *= .92; p.mul.atk *= 1.14; } },
  { id: 'b_stone', n: 'Slow and Sure', d: '-6% damage, +18% armour', f: p => { p.mul.atk *= .94; p.mul.def *= 1.18; } },
  { id: 'b_life', n: 'Full Heart', d: '+12% max health, mended now', f: p => { p.mul.hp *= 1.12; p.hp = 1e9; p.st = {}; } },
  { id: 'b_mind', n: 'Clear Mind', d: '+8 max MP, -4% max health', f: p => { p.mul.mp += 8; p.mul.hp *= .96; } },
  { id: 'b_gold', n: 'A Fair Trade', d: 'Lose all gold, gain 1 HP max per 5', f: p => { p.mul.hpFlat += Math.floor(p.gold / 5); p.gold = 0; }, ok: p => p.gold >= 50 },
  { id: 'b_edge', n: 'Honed Edge', d: 'Your weapon gains +2', f: p => { if (p.eq.weapon) p.eq.weapon.plus += 2; }, ok: p => !!p.eq.weapon },
  { id: 'b_feast', n: 'Harvest', d: 'Hunger filled and three pasties', f: (p, G) => { p.food = K.hungerMax; G.give({ k: 'food', t: 'pasty', q: 3 }); } },
];

const DEATH_LINES = ['Oliver nods off and wakes by his own bed.', 'A short nap, then home for tea.', 'The valley tucks him in. The deep can wait.', 'He dreams of pasties and slightly better armour.'];
const TIPS = [
  'Push the pad to walk, and into monsters to hit them.', 'Red tiles show where a big attack will land next turn. Step off them.', 'Fight in doorways: only one monster can reach you.', 'Unknown potions are safest to try at full health with nobody about.', 'Liquid Fire and Dozing are meant for throwing.', 'Wearing three pieces of one armour set grants a bonus. Five grants a bigger one.', 'Hold Wait to rest until you are well. It costs time and dinner.', 'Every fourth floor has a boss, and a bed in the room before it.', 'A sleeping monster takes double damage from your first hit.', 'Stairs are an escape, too. Nothing follows you down.',
];
