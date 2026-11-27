/* First draft of our own map symbols: one glyph per wiki category, drawn as line art on a 24 grid. */
window.GLYPH = {
  'Weapons': '<path d="M5 19l2-2M7 17l10-10 2-2-.5 3.5L9 18zM8.5 14.5l1 1M4 20l1.5-1.5"/>',
  'Shields': '<path d="M12 3l7 2.5v5.5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V5.5z"/><path d="M12 7v10M8.5 10.5h7"/>',
  'Armor': '<path d="M7 4l5 2 5-2 3 4-3 2v10H7V10L4 8z"/><path d="M12 6v14"/>',
  'Ashes of War': '<path d="M12 21c-3.5 0-6-2.3-6-5.6 0-2.6 1.8-4.300 3-6.400.3 2 1.200 3 2.200 3.500C11 9 12 6 11.500 3c3.500 2.500 6.500 6.500 6.500 11 0 4-2.500 7-6 7z"/>',
  'Spells': '<path d="M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800z"/><path d="M18 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  'Talismans': '<circle cx="12" cy="14" r="5.500"/><path d="M12 8.500V4M9 4h6M12 11.500l1.500 2.500-1.500 2.500-1.500-2.500z"/>',
  'Spirit Ashes': '<path d="M6 21V11a6 6 0 0112 0v10l-2-1.800-2 1.800-2-1.800-2 1.800-2-1.800z"/><path d="M9.500 11.500v1.500M14.500 11.500v1.500"/>',
  'Key Items': '<circle cx="8" cy="8" r="4"/><path d="M11 11l9 9M16 16l2-2M18.500 18.500l2-2"/>',
  'Sites of Grace': '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.800 2.800M16.200 16.200L19 19M19 5l-2.800 2.800M7.800 16.200L5 19"/>',
  'Locations': '<path d="M12 21s-6.500-6-6.500-11a6.500 6.500 0 0113 0c0 5-6.500 11-6.500 11z"/><circle cx="12" cy="10" r="2.300"/>',
  'Bosses': '<path d="M12 3c-4.500 0-7.500 3-7.500 7 0 2.500 1.200 4.200 3 5.300V19h9v-3.700c1.800-1.100 3-2.800 3-5.300 0-4-3-7-7.500-7z"/><path d="M9 11.500h.01M15 11.500h.01M10.500 19v-2M13.500 19v-2M12 13.500l-1 1.500h2z"/>',
  'Flask Upgrades': '<path d="M10 3h4M10.500 3v5.500L6 18a2 2 0 001.800 3h8.400A2 2 0 0018 18l-4.500-9.500V3"/><path d="M8.200 15h7.600"/>',
  'NPCs': '<circle cx="12" cy="8" r="3.500"/><path d="M5 21c0-4 3-6.500 7-6.500s7 2.500 7 6.500"/>'
};
window.RING = { 'Bosses': '#e0664f', 'Weapons': '#e0c284', 'Shields': '#e0c284', 'Armor': '#e0c284', 'Ashes of War': '#c9a0e8', 'Spells': '#8fb9ff', 'Talismans': '#86c591', 'Spirit Ashes': '#a8e6f0', 'Key Items': '#f0e2b0', 'Sites of Grace': '#f6e39a', 'Locations': '#cfc7b4', 'Flask Upgrades': '#f08fa0', 'NPCs': '#cfc7b4' };
window.symbol = function (cat, size) {
  var g = window.GLYPH[cat] || window.GLYPH['Locations'], ring = window.RING[cat] || '#cfc7b4', s = size || 30;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="-4 -4 32 32"><circle cx="12" cy="12" r="15" fill="#17150f" stroke="' + ring + '" stroke-width="1.800"/><g fill="none" stroke="' + ring + '" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round">' + g + '</g></svg>';
};
