const fs = require('fs');
let lines = fs.readFileSync('frontend/src/views/HomeView.vue', 'utf8').split('\n');

// 1. Remove duplicate CSS block at the end (from the second <style scoped> tag)
let lastStyleTag = lines.lastIndexOf('</style>');
let duplicateStyleStart = lines.lastIndexOf('<style scoped>', lastStyleTag - 1);
if (duplicateStyleStart > 1000) {
    lines.splice(duplicateStyleStart, lastStyleTag - duplicateStyleStart + 1);
}

let content = lines.join('\n');

// 2. Remove TitleBar import
content = content.replace("import TitleBar from '@/components/TitleBar.vue';\n", "");

// 3. Fix scrollAmount and scrollLeft/Right functions
content = content.replace(/const scrollAmount = \d+;\n/, '');
content = content.replace(/function scrollLeft\(e: Event\) \{[\s\S]*?\}\n/, `function scrollLeft(e: Event) {
  const target = e.currentTarget as HTMLElement;
  const container = target.parentElement?.querySelector('.home__algorithms');
  if (container) {
    container.scrollLeft -= container.clientWidth * 0.85;
  }
}
`);
content = content.replace(/function scrollRight\(e: Event\) \{[\s\S]*?\}\n/, `function scrollRight(e: Event) {
  const target = e.currentTarget as HTMLElement;
  const container = target.parentElement?.querySelector('.home__algorithms');
  if (container) {
    container.scrollLeft += container.clientWidth * 0.85;
  }
}
`);

// 4. Change HTML class
content = content.replace(
    /class="home__algorithms"\s+@scroll="onSliderScroll"\s+:class="section\.layout === 'triple_stacked_slider' \? 'home__audios-grid--triple' : 'home__audios-grid'"/g,
    `@scroll="onSliderScroll" :class="section.layout === 'triple_stacked_slider' ? 'home__algorithms home__library-slider' : 'home__audios-grid'"`
);

// 5. Replace CSS block and add !important to guarantee grid override
content = content.replace(
    /\.home__audios-grid--triple\s*\{[\s\S]*?\}\s*\.home__audios-grid--triple::-webkit-scrollbar\s*\{[\s\S]*?\}/g,
    `.home__library-slider {
  display: grid !important;
  grid-template-rows: repeat(3, auto) !important;
  grid-auto-flow: column !important;
  grid-auto-columns: calc((100% - 16px) / 2.5) !important;
  gap: 8px 16px !important;
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
