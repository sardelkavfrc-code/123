const fs = require('fs');
let content = fs.readFileSync('frontend/src/views/HomeView.vue', 'utf8');

content = content.replace(
  `:class="section.layout === 'triple_stacked_slider' ? 'home__audios-grid--triple' : 'home__audios-grid'"`,
  `:class="section.layout === 'triple_stacked_slider' ? 'home__library-slider' : 'home__audios-grid'"`
);

content = content.replace(
  `.home__audios-grid--triple {
  display: grid;
  grid-template-rows: repeat(3, 1fr);
  grid-auto-flow: column;
  grid-auto-columns: minmax(300px, 85vw);
  gap: 8px 24px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: 16px;
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-behavior: smooth;
}
.home__audios-grid--triple::-webkit-scrollbar {
  display: none;
}`,
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
