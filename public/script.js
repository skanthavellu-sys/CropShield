let token = localStorage.getItem("cropshield_token");
let currentUser = null;
let latestRainfall = null;
let currentPolicy = JSON.parse(localStorage.getItem("cropshield_policy") || "null");

const cropLossProbability = {"Padi":0.40,"Rubber":0.30,"Oil Palm":0.25,"Banana":0.45,"Chili":0.50};
const crop30DayReference = {"Padi":180,"Rubber":170,"Oil Palm":180,"Banana":160,"Chili":140};
const $ = id => document.getElementById(id);
const money = n => "RM " + Number(n).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});

function toast(text,ok=true){const t=$("toast");t.textContent=text;t.className=ok?"show ok":"show bad";setTimeout(()=>t.className="",3000)}
function showAuth(mode){document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.auth===mode));$("loginForm").classList.toggle("hidden",mode!=="login");$("registerForm").classList.toggle("hidden",mode!=="register");$("authMessage").textContent=""}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showAuth(b.dataset.auth)));

async function api(url,options={}){options.headers={...(options.headers||{}),"Content-Type":"application/json"};if(token)options.headers.Authorization="Bearer "+token;const r=await fetch(url,options);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Request failed.");return d}

async function getLocations(state){return api("/api/locations?state="+encodeURIComponent(state))}
async function fillStates(selectId){const d=await api("/api/locations");const s=$(selectId);if(!s)return;s.innerHTML='<option value="">Select state</option>'+d.states.map(x=>`<option>${escapeHtml(x)}</option>`).join("")}
async function setupLocationPair(stateId,districtId,latId,lonId){
  const state=$(stateId),district=$(districtId);
  if(!state||!district)return;
  await fillStates(stateId);
  state.addEventListener("change",async()=>{
    district.innerHTML='<option value="">Loading districts…</option>';district.disabled=true;
    if(!state.value){district.innerHTML='<option value="">Select district</option>';return}
    try{
      const d=await getLocations(state.value);
      district.innerHTML='<option value="">Select district</option>'+d.districts.map(x=>`<option value="${escapeHtml(x.name)}" data-lat="${x.latitude}" data-lon="${x.longitude}">${escapeHtml(x.name)}</option>`).join("");
      district.disabled=false;
    }catch(e){district.innerHTML='<option value="">Unable to load</option>'}
  });
  district.addEventListener("change",()=>{
    const o=district.selectedOptions[0];
    if(o?.dataset.lat){$(latId).value=o.dataset.lat;$(lonId).value=o.dataset.lon}
  });
}
async function setLocationPair(stateId,districtId,latId,lonId,stateVal,districtVal){
  if(!stateVal)return;
  $(stateId).value=stateVal;
  const d=await getLocations(stateVal).catch(()=>null);
  if(!d)return;
  $(districtId).innerHTML='<option value="">Select district</option>'+d.districts.map(x=>`<option value="${escapeHtml(x.name)}" data-lat="${x.latitude}" data-lon="${x.longitude}">${escapeHtml(x.name)}</option>`).join("");
  $(districtId).disabled=false;
  $(districtId).value=districtVal||"";
  const o=$(districtId).selectedOptions[0];
  if(o?.dataset.lat && !$(latId).value){$(latId).value=o.dataset.lat;$(lonId).value=o.dataset.lon}
}

function setUser(user){
  currentUser=user;
  $("sideName").textContent=user.name;
  $("sideLocation").textContent=user.district&&user.state?`${user.district}, ${user.state}`:(user.location||"Farm location not set");
  $("avatar").textContent=user.name.charAt(0).toUpperCase();
  $("profileAvatar").textContent=user.name.charAt(0).toUpperCase();
  $("profileName").textContent=user.name;$("profileEmail").textContent=user.email;
  $("profileNameInput").value=user.name;$("profileLocationInput").value=user.location||"";
  setLocationPair("profileState","profileDistrict","profileLat","profileLon",user.state,user.district).catch(()=>{});
}
function showApp(){$("authPage").classList.add("hidden");$("appPage").classList.remove("hidden");renderPolicy();loadClaims()}
function showAuthPage(){$("appPage").classList.add("hidden");$("authPage").classList.remove("hidden")}

$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("authMessage").textContent="Logging in…";try{const d=await api("/api/login",{method:"POST",body:JSON.stringify({email:$("loginEmail").value,password:$("loginPassword").value})});token=d.token;localStorage.setItem("cropshield_token",token);setUser(d.user);showApp()}catch(err){$("authMessage").textContent=err.message}});
$("registerForm").addEventListener("submit",async e=>{e.preventDefault();$("authMessage").textContent="Creating account…";try{
  const d=await api("/api/register",{method:"POST",body:JSON.stringify({
    name:$("regName").value,email:$("regEmail").value,password:$("regPassword").value,
    location:$("regLocation").value,state:$("regState").value,district:$("regDistrict").value
  })});token=d.token;localStorage.setItem("cropshield_token",token);setUser(d.user);showApp()
}catch(err){$("authMessage").textContent=err.message}});

$("logoutBtn").addEventListener("click",async()=>{try{await api("/api/logout",{method:"POST"})}catch{}token=null;localStorage.removeItem("cropshield_token");showAuthPage()});

function navigate(page){document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));$("page-"+page).classList.remove("hidden");document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===page));const titles={dashboard:"Dashboard",calculator:"Insurance",policy:"My Policy",claims:"Claims",reports:"Rainfall Data",profile:"Profile"};$("pageTitle").textContent=titles[page]||"Dashboard";if(page==="reports")loadReportFromCalculator()}
document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.page)));
document.querySelectorAll("[data-page-jump]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.pageJump)));

function droughtProbability(actual,crop){const ref=crop30DayReference[crop]||170;const ratio=actual/ref;if(ratio<=0.45)return 0.90;if(ratio<=0.55)return 0.75;if(ratio<=0.70)return 0.55;if(ratio<=0.85)return 0.35;if(ratio<=1.00)return 0.15;return 0.05}
function riskFromRain(actual,crop){const p=droughtProbability(actual,crop);if(p>=0.70)return{level:"High",signal:"High drought probability",probability:p};if(p>=0.35)return{level:"Medium",signal:"Moderate drought probability",probability:p};return{level:"Low",signal:"Low drought probability",probability:p}}
async function fetchRainfall(lat,lon){const d=await api(`/api/rainfall?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);latestRainfall=d;return d}
function updateDashboard(data,crop="Padi"){$("dashActual").textContent=data.historical.totalMm.toFixed(1)+" mm";$("dashForecast").textContent=data.forecast.totalMm.toFixed(1)+" mm";const r=riskFromRain(data.historical.totalMm,crop);$("dashRisk").textContent=r.level;$("dashRiskText").textContent=r.signal;$("dashHistory").textContent=data.historical.totalMm.toFixed(1)+" mm";$("dashProgress").style.width=Math.min(100,Math.max(0,data.historical.totalMm/(crop30DayReference[crop]||170)*100))+"%"}

$("calculateBtn").addEventListener("click",async()=>{
  const lat=Number($("lat").value),lon=Number($("lon").value),crop=$("crop").value,sum=Number($("sumInsured").value),coverage=Number($("coverage").value);
  $("calcError").classList.add("hidden");$("calcLoading").classList.remove("hidden");$("calcResult").classList.add("hidden");
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180){$("calcLoading").classList.add("hidden");$("calcError").textContent="Please select a valid Malaysian state and district.";return $("calcError").classList.remove("hidden")}
  if(sum<100||coverage<10||coverage>100){$("calcLoading").classList.add("hidden");$("calcError").textContent="Check the sum insured and coverage percentage.";return $("calcError").classList.remove("hidden")}
  try{const d=await fetchRainfall(lat,lon);
    const risk=riskFromRain(d.historical.totalMm,crop);
    const pDrought=risk.probability;
    const pLoss=cropLossProbability[crop]||0.40;
    const insuredAmount=sum*(coverage/100);
    const premium=pDrought*insuredAmount*pLoss;
    $("premium").textContent=money(premium);$("riskLevel").textContent=risk.level;$("actual30").textContent=d.historical.totalMm.toFixed(1)+" mm";$("forecast7").textContent=d.forecast.totalMm.toFixed(1)+" mm";$("rainSignal").textContent=risk.signal;$("droughtProbability").textContent=(pDrought*100).toFixed(0)+"%";$("lossProbability").textContent=(pLoss*100).toFixed(0)+"%";$("dataSource").textContent="Open-Meteo API";$("calcResult").classList.remove("hidden");updateDashboard(d,crop)}catch(err){$("calcError").textContent=err.message;$("calcError").classList.remove("hidden")}finally{$("calcLoading").classList.add("hidden")}
});

$("savePolicyBtn").addEventListener("click",()=>{if(!latestRainfall)return;const crop=$("crop").value,sum=Number($("sumInsured").value),coverage=Number($("coverage").value);const pDrought=droughtProbability(latestRainfall.historical.totalMm,crop);const pLoss=cropLossProbability[crop]||0.40;const insuredAmount=sum*(coverage/100);const premium=pDrought*insuredAmount*pLoss;currentPolicy={id:"CS-"+Date.now().toString().slice(-8),crop,sum,coverage,insuredAmount,premium,droughtProbability:pDrought,lossProbability:pLoss,rainfall30:latestRainfall.historical.totalMm,coordinates:latestRainfall.coordinates,state:$("calcState").value,district:$("calcDistrict").value,createdAt:new Date().toISOString()};localStorage.setItem("cropshield_policy",JSON.stringify(currentPolicy));renderPolicy();toast("Prototype policy saved.");navigate("policy")});
function renderPolicy(){if(!currentPolicy){$("policyEmpty").classList.remove("hidden");$("policyContent").classList.add("hidden");$("dashPolicy").textContent="No Policy";return}$("policyEmpty").classList.add("hidden");$("policyContent").classList.remove("hidden");$("policyId").textContent=currentPolicy.id;$("policyCrop").textContent=currentPolicy.crop;$("policySum").textContent=money(currentPolicy.sum);$("policyPremium").textContent=money(currentPolicy.premium);$("policyRain").textContent=Number(currentPolicy.rainfall30).toFixed(1)+" mm / 30 days";if($("policyDrought"))$("policyDrought").textContent=(Number(currentPolicy.droughtProbability||0)*100).toFixed(0)+"%";if($("policyLoss"))$("policyLoss").textContent=(Number(currentPolicy.lossProbability||0)*100).toFixed(0)+"%";$("dashPolicy").textContent="Active"}

async function loadClaims(){try{const d=await api("/api/claims");$("claimsList").innerHTML=d.claims.length?d.claims.map(c=>`<div class="claim"><div><strong>${escapeHtml(c.crop)}</strong><br><small>${escapeHtml(c.reason)}</small></div><div><strong>${money(c.amount)}</strong><br><small>${escapeHtml(c.status)}</small></div></div>`).join(""):`<div class="empty">No claims submitted.</div>`}catch{}}
$("claimBtn").addEventListener("click",async()=>{try{await api("/api/claims",{method:"POST",body:JSON.stringify({policyId:currentPolicy?.id,crop:$("claimCrop").value,amount:$("claimAmount").value,reason:$("claimReason").value})});$("claimReason").value="";$("claimAmount").value="";toast("Claim submitted.");loadClaims()}catch(err){toast(err.message,false)}});

function loadReportFromCalculator(){if($("calcState").value){setLocationPair("reportState","reportDistrict","reportLat","reportLon",$("calcState").value,$("calcDistrict").value)}else{fillStates("reportState")}if(latestRainfall)renderReport(latestRainfall)}
function renderReport(d){$("reportSummary").innerHTML=`<div class="report-box"><span>30-day actual</span><strong>${d.historical.totalMm.toFixed(1)} mm</strong></div><div class="report-box"><span>7-day forecast</span><strong>${d.forecast.totalMm.toFixed(1)} mm</strong></div><div class="report-box"><span>Coordinates</span><strong>${d.coordinates.latitude.toFixed(4)}, ${d.coordinates.longitude.toFixed(4)}</strong></div>`;$("rainTable").innerHTML=d.historical.daily.map(x=>`<tr><td>${x.date}</td><td>${x.mm.toFixed(1)} mm</td></tr>`).join("")}
$("reportBtn").addEventListener("click",async()=>{try{const d=await fetchRainfall(Number($("reportLat").value),Number($("reportLon").value));renderReport(d);updateDashboard(d,$("crop").value);toast("Rainfall data updated.")}catch(err){toast(err.message,false)}});

$("profileSave").addEventListener("click",async()=>{try{const d=await api("/api/profile",{method:"PUT",body:JSON.stringify({name:$("profileNameInput").value,location:$("profileLocationInput").value,state:$("profileState").value,district:$("profileDistrict").value,latitude:$("profileLat").value||null,longitude:$("profileLon").value||null})});setUser(d.user);toast("Profile saved.")}catch(err){toast(err.message,false)}});

function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
async function init(){
  await Promise.all([
    setupLocationPair("regState","regDistrict","lat","lon").catch(()=>{}),
    setupLocationPair("calcState","calcDistrict","lat","lon").catch(()=>{}),
    setupLocationPair("reportState","reportDistrict","reportLat","reportLon").catch(()=>{}),
    setupLocationPair("profileState","profileDistrict","profileLat","profileLon").catch(()=>{})
  ]);
  if(!token){showAuthPage();return}
  try{const d=await api("/api/me");setUser(d.user);showApp()}catch{token=null;localStorage.removeItem("cropshield_token");showAuthPage()}
}
init();
