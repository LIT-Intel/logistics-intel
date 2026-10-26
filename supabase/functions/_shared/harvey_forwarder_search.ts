import {planForwarderLookup,validateForwarderSearchPlan,type ForwarderSearchPlan} from "./harvey_forwarder_plan.ts";
type Row={id:string;company_name:string|null;city:string|null;state:string|null;vertical:string|null;top_forwarders:any;updated_at:string|null};
function safeText(value:unknown):string|null{return typeof value==="string"&&value.trim()?value.trim():null}
function isFreightCompany(vertical:string|null):boolean{
 const v=(vertical||"").toLowerCase();
 return /(?:freight|logistics|forwarding|transportation|trucking|3pl|4pl|brokerage|shipping services)/.test(v);
}
/** Executed only after harvey-copilot's existing auth, active-org, and flag gate.
 * Uses the user's RLS-scoped client, not service_role; it never modifies records.
 */
export async function executeForwarderDirectorySearch(userClient:any,question:unknown){
 const result=planForwarderLookup(question);
 if(!result.plan)return {ok:false,error:"unsupported_forwarder_query",clarification:result.clarification};
 const plan=validateForwarderSearchPlan(result.plan);
 if(!plan)return {ok:false,error:"invalid_query_plan"};
 let query=userClient.from("lit_company_directory")
    .select("id,company_name,city,state,vertical,top_forwarders,updated_at",{count:"exact"})
    .contains("top_forwarders",[{name:plan.providerName}])
    .order("company_name",{ascending:true});
 if(plan.state)query=query.eq("state",plan.state);
 // Exact company-role exclusion must be server-side, not a filter on a
 // representative client sample. Unknowns are excluded when the user asks
 // to exclude logistics competitors because they cannot be verified.
 if(plan.excludeLogisticsCompanies)
   query=query.not("vertical","is",null).neq("vertical","Undefined")
     .not("vertical","ilike","%freight%")
     .not("vertical","ilike","%logistics%")
     .not("vertical","ilike","%transport%")
     .not("vertical","ilike","%forward%")
     .not("vertical","ilike","%trucking%")
     .not("vertical","ilike","%broker%");
 const {data,error,count}=await query.limit(plan.limit);
 if(error){
  // Safe diagnostic fields only. Never log auth tokens, query data, or customer PII.
  console.error("[harvey_forwarder_search] directory_query_failed",{
    code:error.code ?? null, message:error.message ?? null,
    details:error.details ?? null, hint:error.hint ?? null,
    state_filter:plan.state, has_competitor_exclusion:plan.excludeLogisticsCompanies,
  });
  return {ok:false,error:"directory_query_failed",error_code:error.code ?? null,
    clarification:"Harvey could not query the historical provider directory. Please retry or contact support with the request ID."};
 }
 const rows=(data||[]) as Row[];
 const matches=rows.filter(row=>Array.isArray(row.top_forwarders)&&
   row.top_forwarders.some(item=>item?.name===plan.providerName));
 return {ok:true,
  plan,
  rows:matches.map(row=>({
    id:row.id,company_name:safeText(row.company_name),city:safeText(row.city),
    state:safeText(row.state),vertical:safeText(row.vertical),
    source_updated_at:row.updated_at,
    relationship:{
      provider_name:plan.providerName,
      provider_reported:true,scope:"company_history_unspecified",
      provider_role:"freight_intermediary_or_direct_label",
      lane_verified:false,window_verified:false,
      teu_verified:false,
    },
  })),
  count:count??null,
  returned:matches.length,
  truncated:count!==null&&count>matches.length,
  source:"lit_company_directory.top_forwarders",
  provenance:"Historical V6 CSV company-wide provider summary; not current or lane-specific BOL evidence",
  quality_notice:"Reported TEU is withheld pending source verification (#178). Company role exclusions use listed verticals; unknown categories are omitted when competitor exclusion is requested.",
  next_steps:["Review selected company profiles and provider source coverage","Refine location and provider filters","Use verified BOL source tools for lane-specific incumbent or TEU questions"],
 };
}
