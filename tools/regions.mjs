// Where each region of the game opens in the wiki walkthrough. Used by build-route.mjs (order) and check-route.mjs.
export const ENTRY = [  // region on the place page -> the walkthrough step (header region | title) after which it is open
  ['Stormhill', /^stormhill \|/i], ['Mistwood', /exploring east limgrave/i], ['Weeping Peninsula', /explore the weeping peninsula/i],
  ['Liurnia of the Lakes', /^liurnia/i], ['Three Sisters', /complete caria manor/i], ['Moonlight Altar', /lake of rot and the grand cloister/i],
  ['Caelid', /^caelid \|/i], ['Dragonbarrow', /^caelid \|/i], ['Wailing Dunes', /radahn festival/i],
  ['Siofra River', /explore siofra river/i], ['Ainsel River', /investigate ainsel river/i], ['Ainsel River Main', /\| ainsel river main/i], ['Lake of Rot', /\| ainsel river main/i],
  ['Nokron, Eternal City', /\| nokron, eternal city/i], ['Altus Plateau', /^altus plateau \|/i], ['Mt. Gelmir', /^mt\. gelmir \|/i],
  ['Capital Outskirts', /^leyndell, royal capital \|/i], ['Leyndell, Royal Capital', /^leyndell, royal capital \|/i],
  ['Mountaintops of the Giants', /^mountaintops of the giants \|/i], ['Consecrated Snowfield', /^consecrated snowfield \|/i], ['Mohgwyn Palace', /| cave of the forlorn/i],
  ['Gravesite Plain', /^gravesite plain/i], ['Scadu Altus', /^scadu altus \|/i], ['Rauh Ruins', /^rauh base \|/i], ['Cerulean Coast', /^cerulean coast/i], ['Abyssal Woods', /^abyss \|/i],
];
export const canonRegion = r => r && r.replace('Mt Gelmir', 'Mt. Gelmir').replace('Leyndell Royal Capital', 'Leyndell, Royal Capital');
// "Artist's Shack (Limgrave)" is not the Artist's Shack of Liurnia: a region in brackets is the region

// Single places the walkthrough's own text puts at a particular point, although the map alone would slot them elsewhere:
//   Divine Tower of Limgrave  - "After Godrick": "fast travel to the Limgrave Tower Bridge ... reach the Divine Tower of Limgrave"
//   Renna's Rise              - "After giving her the blade, Renna's Rise will be opened" (Nokron, Eternal City and Ranni's Quest)
//   Divine Tower of Liurnia   - reached "as part of Ranni's quest ... after defeating Radahn and giving the Fingerslayer Blade"
//   Forge of the Giants       - the way into Crumbling Farum Azula; resting there changes the capital for good
export const SPECIAL = [
  ['Divine Tower of Limgrave', /^after godrick$/i, 'after'], ["Renna's Rise", /^nokron, eternal city and ranni's quest$/i, 'after'],
  ['Divine Tower of Liurnia', /^nokron, eternal city and ranni's quest$/i, 'after'],
  ['Mohgwyn Dynasty Mausoleum', /^cave of the forlorn$/i, 'after'],   // "Return to the Waygate that teleports you to the underground area beneath Caelid to find Mohgwyn Palace"
  ['Forge of the Giants', /^crumbling farum azula$/i, 'before'],
];
