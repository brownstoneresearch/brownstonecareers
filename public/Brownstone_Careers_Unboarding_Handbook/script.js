
const pages=[...document.querySelectorAll('.page')];
const nav=[...document.querySelectorAll('.nav-item')];
let current=0;
function show(i){
  current=Math.max(0,Math.min(pages.length-1,i));
  pages.forEach((p,n)=>p.classList.toggle('active',n===current));
  nav.forEach((b,n)=>b.classList.toggle('active',n===current));
  nav[current]?.scrollIntoView({block:'nearest'});
  window.scrollTo({top:0,behavior:'smooth'});
}
nav.forEach((b,i)=>b.addEventListener('click',()=>{show(i);document.querySelector('aside').classList.remove('open')}));
document.getElementById('prevBtn').onclick=()=>show(current-1);
document.getElementById('nextBtn').onclick=()=>show(current+1);
document.getElementById('menuBtn').onclick=()=>document.querySelector('aside').classList.toggle('open');
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')show(current+1);if(e.key==='ArrowLeft')show(current-1)});
show(0);
