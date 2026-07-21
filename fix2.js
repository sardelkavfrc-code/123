const fs = require('fs');
let lines = fs.readFileSync('frontend/src/views/HomeView.vue', 'utf8').split('\n');
let idx = lines.findIndex(l => l.includes('.home__audios-grid--triple {'));
lines.splice(idx, lines.length - idx);
lines.push('.home__library-slider {', '  display: grid;', '  grid-template-rows: repeat(3, auto);', '  grid-auto-flow: column;', '  grid-auto-columns: calc((100% - 16px) / 2.5);', '  gap: 8px 16px;', '  overflow-x: auto;', '  scrollbar-width: none;', '  padding-bottom: 8px;', '  scroll-behavior: smooth;', '  scroll-snap-type: x mandatory;', '}', '.home__library-slider::after {', '  content: "";', '  display: block;', '  grid-row: 1 / -1;', '  width: 65vw;', '}', '.home__library-slider > * {', '  scroll-snap-align: start;', '}', '.home__library-slider::-webkit-scrollbar {', '  display: none;', '}', '</style>');
fs.writeFileSync('frontend/src/views/HomeView.vue', lines.join('\n'));
