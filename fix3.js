const fs = require('fs');
let lines = fs.readFileSync('frontend/src/views/HomeView.vue', 'utf8').split('\n');

// 1. Remove duplicate CSS block at the end (lines 1240 onwards)
let lastStyleTag = lines.lastIndexOf('</style>');
let duplicateStyleStart = lines.lastIndexOf('<style scoped>', lastStyleTag - 1);
if (duplicateStyleStart > 1000) {
    // If there's a second <style scoped> block near the end, delete it
    lines.splice(duplicateStyleStart, lastStyleTag - duplicateStyleStart + 1);
}

// 2. Replace HTML class
let content = lines.join('\n');
content = content.replace(
    /class="home__algorithms"\s+@scroll="onSliderScroll"\s+:class="section\.layout === 'triple_stacked_slider' \? 'home__audios-grid--triple' : 'home__audios-grid'"/g,
    `@scroll="onSliderScroll" :class="section.layout === 'triple_stacked_slider' ? 'home__algorithms home__library-slider' : 'home__audios-grid'"`
);

// 3. Replace CSS block
content = content.replace(
    /\.home__audios-grid--triple\s*\{[\s\S]*?\}\s*\.home__audios-grid--triple::-webkit-scrollbar\s*\{[\s\S]*?\}/g,
    `.home__library-slider {
  display: grid;
  grid-template-rows: repeat(3, auto);
  grid-auto-flow: column;
  grid-auto-columns: calc((100% - 16px) / 2.5);
  gap: 8px 16px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 8px;
  scroll-behavior: smooth;
  scroll-snap-type: x mandatory;
}
.home__library-slider::after {
  content: "";
  display: block;
  grid-row: 1 / -1;
  width: 65vw;
}
.home__library-slider > * {
  scroll-snap-align: start;
}
.home__library-slider::-webkit-scrollbar {
  display: none;
}`
);

fs.writeFileSync('frontend/src/views/HomeView.vue', content);
