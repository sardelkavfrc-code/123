const fs = require('fs');
let content = fs.readFileSync('frontend/src/views/HomeView.vue', 'utf8');

const js = `
function updateSliderButtons(container: HTMLElement) {
  const parent = container.parentElement;
  if (!parent) return;
  const btnPrev = parent.querySelector('.home__slider-btn--prev');
  const btnNext = parent.querySelector('.home__slider-btn--next');
  if (btnPrev && btnNext) {
    const canScrollLeft = container.scrollLeft > 0;
    const canScrollRight = Math.ceil(container.scrollLeft + container.clientWidth) < container.scrollWidth;
    
    if (container.scrollWidth <= container.clientWidth) {
      btnPrev.classList.add('home__slider-btn--hidden');
      btnNext.classList.add('home__slider-btn--hidden');
    } else {
      btnPrev.classList.toggle('home__slider-btn--hidden', !canScrollLeft);
      btnNext.classList.toggle('home__slider-btn--hidden', !canScrollRight);
    }
  }
}

function onSliderHover(e: Event) {
  const container = (e.currentTarget as HTMLElement).querySelector('.home__algorithms') as HTMLElement;
  if (container) updateSliderButtons(container);
}

function onSliderScroll(e: Event) {
  updateSliderButtons(e.currentTarget as HTMLElement);
}

function scrollLeft(e: Event) {
  const target = e.currentTarget as HTMLElement;
  const container = target.parentElement?.querySelector('.home__algorithms');
  if (container) {
    container.scrollLeft -= container.clientWidth * 0.85;
  }
}

function scrollRight(e: Event) {
  const target = e.currentTarget as HTMLElement;
  const container = target.parentElement?.querySelector('.home__algorithms');
  if (container) {
    container.scrollLeft += container.clientWidth * 0.85;
  }
}
`;

content = content.replace('const loadingAlbumId = ref<string | null>(null);', 'const loadingAlbumId = ref<string | null>(null);' + js);

fs.writeFileSync('frontend/src/views/HomeView.vue', content);
