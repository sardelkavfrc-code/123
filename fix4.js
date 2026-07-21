const fs = require('fs');
let content = fs.readFileSync('frontend/src/views/HomeView.vue', 'utf8');

const sliderCSS = `.home__library-slider {
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
}`;

// Append the !important version to the end of the styles to guarantee override
content = content.replace('</style>', sliderCSS + '\n</style>');

fs.writeFileSync('frontend/src/views/HomeView.vue', content);
