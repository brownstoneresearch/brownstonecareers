
const toggle=document.querySelector(".menu-toggle"),nav=document.querySelector(".main-nav");
toggle?.addEventListener("click",()=>{const o=nav.classList.toggle("open");toggle.setAttribute("aria-expanded",String(o))});
document.querySelectorAll(".main-nav a").forEach(a=>a.addEventListener("click",()=>nav?.classList.remove("open")));
const year=document.getElementById("year");if(year)year.textContent=new Date().getFullYear();

const params=new URLSearchParams(location.search);
const role=params.get("role");
const roleSelect=document.getElementById("roleSelect");
if(role&&roleSelect){roleSelect.value=role}

document.querySelectorAll(".email-form").forEach(form=>{
  form.addEventListener("submit",e=>{
    e.preventDefault();
    const d=new FormData(form);
    const type=form.dataset.formType||"Website Submission";
    let subject="",lines=[];
    if(type==="Career Application"){
      subject=`Career Application - ${d.get("role")} - ${d.get("firstName")} ${d.get("lastName")}`;
      lines=[
        "BROWNSTONE CAREERS APPLICATION","",
        `Name: ${d.get("firstName")} ${d.get("lastName")}`,
        `Email: ${d.get("email")}`,`Phone: ${d.get("phone")}`,
        `Role: ${d.get("role")}`,`Time Zone: ${d.get("timezone")}`,
        `Available Start Date: ${d.get("startDate")}`,"",
        "Relevant Experience:",d.get("experience"),"",
        "Interest in Role:",d.get("interest")
      ];
    }else{
      subject=`Support Request - ${d.get("subject")} - ${d.get("name")}`;
      lines=["BROWNSTONE CAREERS SUPPORT REQUEST","",`Name: ${d.get("name")}`,`Email: ${d.get("email")}`,`Subject: ${d.get("subject")}`,"","Message:",d.get("message")];
    }
    location.href=`mailto:support@brownstonecareers.agency?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
  });
});


// Premium interactions
const current=(document.body.dataset.page||'').replace('index','home');
document.querySelectorAll('.main-nav a').forEach(a=>{const file=(a.getAttribute('href')||'').split('?')[0]; if((current==='home'&&file==='index.html')||file===current+'.html')a.classList.add('active');});
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}}),{threshold:.1});
document.querySelectorAll('.premium-features article,.journey-list article,.role-card,.contact-card').forEach(el=>{el.classList.add('reveal');io.observe(el)});
