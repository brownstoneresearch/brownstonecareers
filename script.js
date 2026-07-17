
const toggle=document.querySelector(".cover-menu-toggle"),nav=document.querySelector(".cover-main-nav");
toggle?.addEventListener("click",()=>{const open=nav.classList.toggle("open");toggle.setAttribute("aria-expanded",String(open))});
document.querySelectorAll(".cover-main-nav a").forEach(a=>a.addEventListener("click",()=>nav?.classList.remove("open")));
const page=document.body.dataset.page;
document.querySelectorAll("[data-nav]").forEach(link=>{if(link.dataset.nav===page)link.classList.add("active")});
const year=document.getElementById("year");if(year)year.textContent=new Date().getFullYear();
const params=new URLSearchParams(location.search),role=params.get("role"),roleSelect=document.getElementById("roleSelect");if(role&&roleSelect)roleSelect.value=role;
document.querySelectorAll(".email-form").forEach(form=>form.addEventListener("submit",e=>{
e.preventDefault();const d=new FormData(form),type=form.dataset.formType||"Website Submission";let subject="",lines=[];
if(type==="Career Application"){subject=`Career Application - ${d.get("role")} - ${d.get("firstName")} ${d.get("lastName")}`;lines=["BROWNSTONE CAREERS APPLICATION","",`Name: ${d.get("firstName")} ${d.get("lastName")}`,`Email: ${d.get("email")}`,`Phone: ${d.get("phone")}`,`Role: ${d.get("role")}`,`Time Zone: ${d.get("timezone")}`,`Available Start Date: ${d.get("startDate")}`,"","Relevant Experience:",d.get("experience"),"","Interest in Role:",d.get("interest"),"","Software and Technical Skills:",d.get("skills"),"","Remote-Work Readiness:",d.get("readiness")]}
else{subject=`Support Request - ${d.get("subject")} - ${d.get("name")}`;lines=["BROWNSTONE CAREERS SUPPORT REQUEST","",`Name: ${d.get("name")}`,`Email: ${d.get("email")}`,`Subject: ${d.get("subject")}`,"","Message:",d.get("message")]}
location.href=`mailto:support@brownstonecareers.agency?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`}));
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("visible");observer.unobserve(entry.target)}}),{threshold:.1});
document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));
