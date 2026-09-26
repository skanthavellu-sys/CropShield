let token = localStorage.getItem("cropshield_token");
let currentUser = null;
let latestRainfall = null;
let currentPolicy = null;
let latestQuote = null;

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
  const state=$(stateId),district=$(districtId);if(!state||!district)return;
  await fillStates(stateId);
  state.addEventListener("change",async()=>{district.innerHTML='<option value="">Loading districts…</option>';district.disabled=true;if(!state.value){district.innerHTML='<option value="">Select district</option>';return}try{const d=await getLocations(state.value);district.innerHTML='<option value="">Select district</option>'+d.districts.map(x=>`<option value="${escapeHtml(x.name)}" data-lat="${x.latitude}" data-lon="${x.longitude}">${escapeHtml(x.name)}</option>`).join("");district.disabled=false}catch(e){district.innerHTML='<option value="">Unable to load</option>'}});
  district.addEventListener("change",()=>{const o=district.selectedOptions[0];if(o?.dataset.lat&&$(latId)&&$(lonId)){ $(latId).value=o.dataset.lat;$(lonId).value=o.dataset.lon; }});
}
async function setLocationPair(stateId,districtId,latId,lonId,stateVal,districtVal){if(!stateVal)return;$(stateId).value=stateVal;const d=await getLocations(stateVal).catch(()=>null);if(!d)return;$(districtId).innerHTML='<option value="">Select district</option>'+d.districts.map(x=>`<option value="${escapeHtml(x.name)}" data-lat="${x.latitude}" data-lon="${x.longitude}">${escapeHtml(x.name)}</option>`).join("");$(districtId).disabled=false;$(districtId).value=districtVal||"";const o=$(districtId).selectedOptions[0];if(o?.dataset.lat&&$(latId)&&!$(latId).value){$(latId).value=o.dataset.lat;$(lonId).value=o.dataset.lon}}

function setUser(user){
  currentUser=user;
  $("sideName").textContent=user.name;$("sideLocation").textContent=user.district&&user.state?`${user.district}, ${user.state}`:(user.location||"Farm location not set");
  $("avatar").textContent=user.name.charAt(0).toUpperCase();$("profileAvatar").textContent=user.name.charAt(0).toUpperCase();$("profileName").textContent=user.name;$("profileEmail").textContent=user.email;$("profileNameInput").value=user.name;$("profileLocationInput").value=user.location||"";
  setLocationPair("profileState","profileDistrict","profileLat","profileLon",user.state,user.district).catch(()=>{});
}
async function showApp(){
  $("authPage").classList.add("hidden");$("appPage").classList.remove("hidden");
  await loadPolicy();loadClaims();updateClaimScreen();
}
function showAuthPage(){$("appPage").classList.add("hidden");$("authPage").classList.remove("hidden")}

$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("authMessage").textContent="Logging in…";try{const d=await api("/api/login",{method:"POST",body:JSON.stringify({email:$("loginEmail").value,password:$("loginPassword").value})});token=d.token;localStorage.setItem("cropshield_token",token);setUser(d.user);await showApp()}catch(err){$("authMessage").textContent=err.message}});
$("registerForm").addEventListener("submit",async e=>{e.preventDefault();$("authMessage").textContent="Creating account…";try{const d=await api("/api/register",{method:"POST",body:JSON.stringify({name:$("regName").value,email:$("regEmail").value,password:$("regPassword").value,location:$("regLocation").value,state:$("regState").value,district:$("regDistrict").value})});token=d.token;localStorage.setItem("cropshield_token",token);setUser(d.user);await showApp()}catch(err){$("authMessage").textContent=err.message}});
$("logoutBtn").addEventListener("click",async()=>{try{await api("/api/logout",{method:"POST"})}catch{}token=null;currentPolicy=null;localStorage.removeItem("cropshield_token");showAuthPage()});

function navigate(page){document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));$("page-"+page).classList.remove("hidden");document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===page));const titles={dashboard:"Dashboard",calculator:"Insurance",policy:"My Policy",claims:"Claims",reports:"Rainfall Data",profile:"Profile"};$("pageTitle").textContent=titles[page]||"Dashboard";if(page==="reports")loadReportFromCalculator();if(page==="claims")updateClaimScreen();if(page==="policy")renderPolicy()}
document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.page)));
document.querySelectorAll("[data-page-jump]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.pageJump)));

function rainfallProbabilities(actual,crop,customRef,dailyRainfall=[]){
  const ref=crop30DayReference[crop]||customRef||170;
  const ratio=actual/ref;
  // The formula uses probabilities of the two separate rainfall events.
  // For this hackathon prototype, probabilities are estimated from the returned
  // historical daily rainfall observations using the crop's 30-day reference.
  const expectedDaily=ref/30;
  const values=Array.isArray(dailyRainfall)&&dailyRainfall.length?dailyRainfall.map(x=>Number(x.mm)).filter(Number.isFinite):[];
  const sample=values.length?values:[Number(actual)];
  const belowCount=sample.filter(mm=>mm<expectedDaily*0.70).length;
  const excessCount=sample.filter(mm=>mm>expectedDaily*1.30).length;
  return {
    belowProbability:belowCount/sample.length,
    excessProbability:excessCount/sample.length,
    expectedMm:ref,
    ratio
  };
}
function riskFromRain(actual,crop,customRef,dailyRainfall=[]){const r=rainfallProbabilities(actual,crop,customRef,dailyRainfall);const p=r.belowProbability+r.excessProbability;if(p>=0.70)return{level:"High",signal:"High rainfall risk",probability:p};if(p>0)return{level:"Medium",signal:"Rainfall trigger probability detected",probability:p};return{level:"Low",signal:"Low rainfall trigger probability",probability:0}}
async function fetchRainfall(lat,lon){const d=await api(`/api/rainfall?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);latestRainfall=d;return d}
function updateDashboard(data,crop="Padi"){const ref=crop30DayReference[crop]||170;$("dashActual").textContent=data.historical.totalMm.toFixed(1)+" mm";$("dashForecast").textContent=data.forecast.totalMm.toFixed(1)+" mm";const r=riskFromRain(data.historical.totalMm,crop,null,data.historical.daily);$("dashRisk").textContent=r.level;$("dashRiskText").textContent=r.signal;$("dashHistory").textContent=data.historical.totalMm.toFixed(1)+" mm";$("dashProgress").style.width=Math.min(100,Math.max(0,data.historical.totalMm/ref*100))+"%"}

$("crop").addEventListener("change",()=>{const isOther=$("crop").value==="Others";$("otherCropLabel").classList.toggle("hidden",!isOther);$("otherRainfallLabel").classList.toggle("hidden",!isOther)});

$("calculateBtn").addEventListener("click",async()=>{
  const lat=Number($("lat").value),lon=Number($("lon").value),isOther=$("crop").value==="Others",crop=isOther?$("otherCrop").value.trim():$("crop").value,sum=Number($("sumInsured").value),customRef=isOther?Number($("otherRainfall").value):null;
  $("calcError").classList.add("hidden");$("calcLoading").classList.remove("hidden");$("calcResult").classList.add("hidden");
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180){$("calcLoading").classList.add("hidden");$("calcError").textContent="Please select a valid Malaysian state and district.";return $("calcError").classList.remove("hidden")}
  if(!Number.isFinite(sum)||sum<100){$("calcLoading").classList.add("hidden");$("calcError").textContent="Check the sum insured amount.";return $("calcError").classList.remove("hidden")}
  if(isOther&&(!crop||!Number.isFinite(customRef)||customRef<=0)){$("calcLoading").classList.add("hidden");$("calcError").textContent="Enter the other crop name and its expected rainfall requirement.";return $("calcError").classList.remove("hidden")}
  try{
    const d=await fetchRainfall(lat,lon);
    const rainfallRisk=rainfallProbabilities(d.historical.totalMm,crop,customRef,d.historical.daily);
    const risk=riskFromRain(d.historical.totalMm,crop,customRef,d.historical.daily);
    const insuredAmount=sum;
    const premium=insuredAmount*(rainfallRisk.belowProbability+rainfallRisk.excessProbability)*1.20;
    latestQuote={crop,sumInsured:insuredAmount,premium,risk,droughtProbability:rainfallRisk.belowProbability,excessProbability:rainfallRisk.excessProbability,expectedRainfall:rainfallRisk.expectedMm,rainfall30:d.historical.totalMm,coordinates:d.coordinates,state:$("calcState").value,district:$("calcDistrict").value};
    $("premium").textContent=money(premium);$("riskLevel").textContent=risk.level;$("actual30").textContent=d.historical.totalMm.toFixed(1)+" mm";$("forecast7").textContent=d.forecast.totalMm.toFixed(1)+" mm";$("rainSignal").textContent=risk.signal;$("droughtProbability").textContent=(rainfallRisk.belowProbability*100).toFixed(0)+"%";$("lossProbability").textContent=(rainfallRisk.excessProbability*100).toFixed(0)+"%";$("dataSource").textContent="Open-Meteo API";$("calcResult").classList.remove("hidden");updateDashboard(d,crop);
  }catch(err){$("calcError").textContent=err.message;$("calcError").classList.remove("hidden")}finally{$("calcLoading").classList.add("hidden")}
});

function addMonths(date,months){const d=new Date(date);d.setMonth(d.getMonth()+months);return d}
function dateOnly(date){return new Date(date).toISOString().slice(0,10)}
function formatDate(date){return new Date(date).toLocaleDateString("en-MY",{day:"2-digit",month:"short",year:"numeric"})}
function buildExpectedRainfallSchedule(crop,expectedMm,startDate){const start=new Date(startDate);return Array.from({length:9},(_,i)=>{const d=addMonths(start,i);return{month:d.toISOString().slice(0,7),label:d.toLocaleDateString("en-MY",{month:"long",year:"numeric"}),expectedMm:Number(expectedMm)}})}

async function loadPolicy(){try{const d=await api("/api/policies");currentPolicy=d.policies?.[0]||null;renderPolicy()}catch{currentPolicy=null;renderPolicy()}}

$("purchaseBtn").addEventListener("click",async()=>{
  if(!latestQuote){toast("Calculate a premium first.",false);return}
  const purchasedAt=new Date();
  const coverageStart=dateOnly(purchasedAt);const coverageEnd=dateOnly(addMonths(purchasedAt,9));
  const expectedRainfall=buildExpectedRainfallSchedule(latestQuote.crop,latestQuote.expectedRainfall,purchasedAt);
  const policy={id:"CS-"+Date.now().toString().slice(-8),...latestQuote,purchasedAt:purchasedAt.toISOString(),coverageStart,coverageEnd,expectedRainfall,status:"Active"};
  const btn=$("purchaseBtn");btn.disabled=true;btn.textContent="Purchasing…";
  try{const d=await api("/api/policies/purchase",{method:"POST",body:JSON.stringify(policy)});currentPolicy=d.policy;toast("Insurance purchased successfully.");renderPolicy();updateClaimScreen();navigate("policy")}catch(err){toast(err.message,false)}finally{btn.disabled=false;btn.textContent="Purchase Insurance"}
});

function renderPolicy(){
  if(!currentPolicy){$("policyEmpty").classList.remove("hidden");$("policyContent").classList.add("hidden");$("dashPolicy").textContent="No Policy";$("policyStatusPill").textContent="No active policy";return}
  $("policyEmpty").classList.add("hidden");$("policyContent").classList.remove("hidden");$("policyStatusPill").textContent=currentPolicy.status||"Active";$("policyId").textContent=currentPolicy.id;$("policyStatus").textContent=currentPolicy.status||"Active";$("policyCrop").textContent=currentPolicy.crop;$("policySum").textContent=money(currentPolicy.sumInsured);$("policyPremium").textContent=money(currentPolicy.premium);$("policyPurchased").textContent=formatDate(currentPolicy.purchasedAt);$("policyPeriod").textContent=`${formatDate(currentPolicy.coverageStart)} – ${formatDate(currentPolicy.coverageEnd)}`;$("policyRain").textContent=Number(currentPolicy.rainfall30||0).toFixed(1)+" mm / 30 days";$("policyDrought").textContent=(Number(currentPolicy.droughtProbability||0)*100).toFixed(0)+"%";$("policyLoss").textContent=(Number(currentPolicy.excessProbability||0)*100).toFixed(0)+"%";$("dashPolicy").textContent=currentPolicy.status||"Active";
  const schedule=Array.isArray(currentPolicy.expectedRainfall)?currentPolicy.expectedRainfall:[];$("expectedRainfallList").innerHTML=schedule.map(x=>`<div class="expected-item"><small>${escapeHtml(x.label||x.month)}</small><strong>${Number(x.expectedMm||0).toFixed(0)} mm</strong></div>`).join("");
}

async function loadClaims(){try{const d=await api("/api/claims");$("claimsList").innerHTML=d.claims.length?d.claims.map(c=>`<div class="claim"><div><strong>${escapeHtml(c.crop)}</strong><br><small>${escapeHtml(c.reason)}</small><br><small>${escapeHtml(c.trigger||"Manual review")}</small></div><div><strong>${money(c.amount)}</strong><br><small>${escapeHtml(c.status)}</small></div></div>`).join(""):`<div class="empty">No claims submitted.</div>`}catch{$("claimsList").innerHTML='<div class="empty">Unable to load claims.</div>'}}

function updateClaimScreen(){
  if(!$("claimEligibility"))return;
  if(!currentPolicy){$("claimEligibility").className="claim-eligibility not-eligible";$("claimEligibility").textContent="Purchase an active policy before submitting a claim.";$("sensorStatus").textContent="Inactive";return}
  $("claimCrop").value=currentPolicy.crop||"";
  const expected=Number(currentPolicy.expectedRainfall?.[0]?.expectedMm||currentPolicy.expectedRainfall?.[0]?.expected||currentPolicy.expectedRainfall||0);
  const eligible=expected>0&&0<expected*0.70;
  $("sensorRainfall").textContent="0 mm";$("sensorStatus").textContent="Monitoring";
  $("claimEligibility").className=eligible?"claim-eligibility eligible":"claim-eligibility";
  $("claimEligibility").textContent=eligible?`Drought trigger detected: 0 mm is below 70% of expected rainfall (${expected.toFixed(0)} mm). Claim can be submitted for review.`:"Sensor reading is currently not at a trigger threshold.";
}

$("bankAccountNumber").addEventListener("input",()=>{$("bankAccountNumber").value=$("bankAccountNumber").value.replace(/\D/g,"")});
$("claimBtn").addEventListener("click",async()=>{try{if(!currentPolicy){throw new Error("Purchase an active insurance policy before submitting a claim.")}await api("/api/claims",{method:"POST",body:JSON.stringify({policyId:currentPolicy.id,crop:$("claimCrop").value,amount:$("claimAmount").value,reason:$("claimReason").value,bankName:$("bankName").value,accountHolderName:$("accountHolderName").value,bankAccountNumber:$("bankAccountNumber").value})});$("claimReason").value="";$("claimAmount").value="";$("bankName").value="";$("accountHolderName").value="";$("bankAccountNumber").value="";toast("Claim submitted successfully.");loadClaims()}catch(err){toast(err.message,false)}});

function loadReportFromCalculator(){if($("calcState").value){setLocationPair("reportState","reportDistrict","reportLat","reportLon",$("calcState").value,$("calcDistrict").value)}else{fillStates("reportState")}if(latestRainfall)renderReport(latestRainfall)}
function renderReport(d){$("reportSummary").innerHTML=`<div class="report-box"><span>30-day actual</span><strong>${d.historical.totalMm.toFixed(1)} mm</strong></div><div class="report-box"><span>7-day forecast</span><strong>${d.forecast.totalMm.toFixed(1)} mm</strong></div><div class="report-box"><span>Coordinates</span><strong>${d.coordinates.latitude.toFixed(4)}, ${d.coordinates.longitude.toFixed(4)}</strong></div>`;$("rainTable").innerHTML=d.historical.daily.map(x=>`<tr><td>${x.date}</td><td>${x.mm.toFixed(1)} mm</td></tr>`).join("")}
$("reportBtn").addEventListener("click",async()=>{try{const d=await fetchRainfall(Number($("reportLat").value),Number($("reportLon").value));renderReport(d);updateDashboard(d,$("crop").value);toast("Rainfall data updated.")}catch(err){toast(err.message,false)}});

$("profileSave").addEventListener("click",async()=>{try{const d=await api("/api/profile",{method:"PUT",body:JSON.stringify({name:$("profileNameInput").value,location:$("profileLocationInput").value,state:$("profileState").value,district:$("profileDistrict").value,latitude:$("profileLat").value||null,longitude:$("profileLon").value||null})});setUser(d.user);toast("Profile saved.")}catch(err){toast(err.message,false)}});

function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
async function init(){await Promise.all([setupLocationPair("regState","regDistrict","lat","lon").catch(()=>{}),setupLocationPair("calcState","calcDistrict","lat","lon").catch(()=>{}),setupLocationPair("reportState","reportDistrict","reportLat","reportLon").catch(()=>{}),setupLocationPair("profileState","profileDistrict","profileLat","profileLon").catch(()=>{})]);if(!token){showAuthPage();return}try{const d=await api("/api/me");setUser(d.user);await showApp()}catch{token=null;localStorage.removeItem("cropshield_token");showAuthPage()}}
init();
