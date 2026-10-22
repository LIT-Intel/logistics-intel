/** Phase 1: tightly bounded, inspectable planner for freight-provider searches.
 * This is intentionally a deterministic contract: no free-form SQL, no invented
 * company/port/TEU assumptions, no claim of general-language completeness.
 */
export type ForwarderSearchPlan={
 version:"harvey_forwarder_search_v1";
 intent:"lookup_forwarder_accounts";
 providerName:string;
 state:string|null;
 city:string|null;
 excludeLogisticsCompanies:boolean;
 limit:number;
 sortBy:"company_name";
 source:"lit_company_directory.top_forwarders";
 dataScope:"historical_company_wide_not_lane_specific";
};
const STATES:Record<string,string>={
 ga:"Georgia",georgia:"Georgia",il:"Illinois",illinois:"Illinois",
 tx:"Texas",texas:"Texas",ca:"California",california:"California",
 sc:"South Carolina","south carolina":"South Carolina",
 al:"Alabama",alabama:"Alabama",fl:"Florida",florida:"Florida",
 ny:"New York","new york":"New York",nc:"North Carolina","north carolina":"North Carolina",
};
const REVIEWED_PROVIDERS:Record<string,string>={
 dsv:"DSV AIR & SEA INC. DBA. DSV OCEAN TRANSPORT",
 "dsv air and sea":"DSV AIR & SEA INC. DBA. DSV OCEAN TRANSPORT",
 "expeditors":"EXPEDITORS INTERNATIONAL OF WASHINGTON INC",
 "kuehne nagel":"KUEHNE + NAGEL (BLUE ANCHOR AMERICA LINE (BLUE ANCHOR LINE))",
 "kuehne and nagel":"KUEHNE + NAGEL (BLUE ANCHOR AMERICA LINE (BLUE ANCHOR LINE))",
 "bco direct":"BCO - Direct to Carrier",
 "direct to carrier":"BCO - Direct to Carrier",
};
function normalizeWords(s:string){return s.toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ")}
export function planForwarderLookup(text:unknown):{plan:ForwarderSearchPlan|null;clarification:string|null}{
 if(typeof text!=="string" || text.length>1500)return {plan:null,clarification:"Please provide a shorter freight-provider search question."};
 const q=normalizeWords(text);
 // These concepts require separate verified shipment-lane/monthly tools.
 // Never answer a Germany-lane or verified TEU question using an undated
 // company-level directory snapshot.
 if(/\b(?:german|germany|rotterdam|antwerp|lane|routes?|load(?:ing)? ports?|12 months|last year|past year|recent|teus?|shipments?|incumbent|current|today)\b/.test(q))
   return {plan:null,clarification:"I can search historical company-level provider relationships, but I cannot verify a specific trade lane, recent booking, shipment count, or TEU from this directory source."};
 // Negated provider queries require a separate negative-match plan.
 // Never invert a user's request into the opposite prospect list.
 if(/\b(?:without|exclude|remove|not using|don't use|do not use)\s+(?:any\s+)?(?:of\s+)?(?:dsv|expeditors|kuehne|bco direct)\b/.test(q))
  return {plan:null,clarification:"Excluding a named provider requires a verified negative-match query; that operation is not enabled in this first historical lookup."};
 const mentioned=[...new Set(Object.entries(REVIEWED_PROVIDERS)
   .filter(([name])=>new RegExp("\\b"+name.replace(/ /g,"\\s+")+"\\b","i").test(q))
   .map(([,canonical])=>canonical))];
 if(mentioned.length>1)
  return {plan:null,clarification:"I can look up one provider at a time in this first release. Please choose which provider to investigate."};
 const hit=Object.entries(REVIEWED_PROVIDERS).find(([name])=>new RegExp(`\\b${name.replace(/ /g,"\\s+")}\\b`,"i").test(q));
 if(!hit)return {plan:null,clarification:"Which named forwarder or direct-booking label should I search for? Supported first-pass provider names include DSV, Expeditors, and Kuehne+Nagel."};
 const geographical=Object.entries(STATES).sort((a,b)=>b[0].length-a[0].length)
    .find(([name])=>new RegExp(`\\b${name.replace(/ /g,"\\s+")}\\b`,"i").test(q));
 const n=q.match(/\b(?:top|show|list|find)\s+(\d{1,3})\b/);
 const limit=Math.max(1,Math.min(n?Number(n[1]):25,100));
 return {plan:{
  version:"harvey_forwarder_search_v1",intent:"lookup_forwarder_accounts",
  providerName:hit[1],state:geographical?.[1]??null,city:null,
  excludeLogisticsCompanies:/\b(?:exclude|without|remove)\s+(?:all\s+)?(?:freight\s+)?(?:forwarders|brokers|3pls|logistics\s+companies)\b/.test(q),
  limit,sortBy:"company_name",
  source:"lit_company_directory.top_forwarders",
  dataScope:"historical_company_wide_not_lane_specific",
 },clarification:null};
}
export const SAFE_PROVIDER_VALUES=Object.freeze([...new Set(Object.values(REVIEWED_PROVIDERS))]);
export function validateForwarderSearchPlan(raw:any):ForwarderSearchPlan|null{
 if(!raw || raw.version!=="harvey_forwarder_search_v1" || raw.intent!=="lookup_forwarder_accounts")return null;
 if(typeof raw.providerName!=="string" || !SAFE_PROVIDER_VALUES.includes(raw.providerName))return null;
 if(raw.state!==null && (typeof raw.state!=="string" || !Object.values(STATES).includes(raw.state)))return null;
 if(raw.city!==null)return null;
 if(typeof raw.excludeLogisticsCompanies!=="boolean" || raw.sortBy!=="company_name")return null;
 if(!Number.isInteger(raw.limit)||raw.limit<1||raw.limit>100)return null;
 return {version:"harvey_forwarder_search_v1",intent:"lookup_forwarder_accounts",
  providerName:raw.providerName,state:raw.state,city:null,
  excludeLogisticsCompanies:raw.excludeLogisticsCompanies,limit:raw.limit,sortBy:"company_name",
  source:"lit_company_directory.top_forwarders",
  dataScope:"historical_company_wide_not_lane_specific"};
}
