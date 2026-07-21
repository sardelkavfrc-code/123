const fs = require('fs');
let content = fs.readFileSync('frontend/src/views/HomeView.vue', 'utf8');

content = content.replace(/const scrollAmount = \d+;/, '');

content = content.replace(/function scrollLeft\(e: Event\) \{[\s\S]*?\}/, `function scrollLeft(e: Event) {
  const target = e.currentTarget as HTMLElement;
  const container = target.parentElement?.querySelector('.home__algorithms');
  if (container) {
    container.scrollLeft -= container.clientWidth * 0.85;
  }
}`);

content = content.replace(/function scrollRight\(e: Event\) \{[\s\S]*?\}/, `function scrollRight(e: Event) {
  const target = e.currentTarget as HTMLElement;
  const container = target.parentElement?.querySelector('.home__algorithms');
  if (container) {
    container.scrollLeft += container.clientWidth * 0.85;
  }
}`);

fs.writeFileSync('frontend/src/views/HomeView.vue', content);
