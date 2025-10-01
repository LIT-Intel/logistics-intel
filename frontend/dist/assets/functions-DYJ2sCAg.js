import{a3 as I,a4 as E,a5 as R,a6 as L,a7 as O,a8 as U,a9 as x,aa as F,ab as $,ac as M,ad as b,ae as G,af as H,ag as J}from"./main-CoHKEHSZ.js";/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const j="type.googleapis.com/google.protobuf.Int64Value",q="type.googleapis.com/google.protobuf.UInt64Value";function P(e,t){const r={};for(const n in e)e.hasOwnProperty(n)&&(r[n]=t(e[n]));return r}function w(e){if(e==null)return null;if(e instanceof Number&&(e=e.valueOf()),typeof e=="number"&&isFinite(e)||e===!0||e===!1||Object.prototype.toString.call(e)==="[object String]")return e;if(e instanceof Date)return e.toISOString();if(Array.isArray(e))return e.map(t=>w(t));if(typeof e=="function"||typeof e=="object")return P(e,t=>w(t));throw new Error("Data cannot be encoded in JSON: "+e)}function y(e){if(e==null)return e;if(e["@type"])switch(e["@type"]){case j:case q:{const t=Number(e.value);if(isNaN(t))throw new Error("Data cannot be decoded from JSON: "+e);return t}default:throw new Error("Data cannot be decoded from JSON: "+e)}return Array.isArray(e)?e.map(t=>y(t)):typeof e=="function"||typeof e=="object"?P(e,t=>y(t)):e}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const N="functions";/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const S={OK:"ok",CANCELLED:"cancelled",UNKNOWN:"unknown",INVALID_ARGUMENT:"invalid-argument",DEADLINE_EXCEEDED:"deadline-exceeded",NOT_FOUND:"not-found",ALREADY_EXISTS:"already-exists",PERMISSION_DENIED:"permission-denied",UNAUTHENTICATED:"unauthenticated",RESOURCE_EXHAUSTED:"resource-exhausted",FAILED_PRECONDITION:"failed-precondition",ABORTED:"aborted",OUT_OF_RANGE:"out-of-range",UNIMPLEMENTED:"unimplemented",INTERNAL:"internal",UNAVAILABLE:"unavailable",DATA_LOSS:"data-loss"};class d extends F{constructor(t,r,n){super(`${N}/${t}`,r||""),this.details=n,Object.setPrototypeOf(this,d.prototype)}}function B(e){if(e>=200&&e<300)return"ok";switch(e){case 0:return"internal";case 400:return"invalid-argument";case 401:return"unauthenticated";case 403:return"permission-denied";case 404:return"not-found";case 409:return"aborted";case 429:return"resource-exhausted";case 499:return"cancelled";case 500:return"internal";case 501:return"unimplemented";case 503:return"unavailable";case 504:return"deadline-exceeded"}return"unknown"}function A(e,t){let r=B(e),n=r,s;try{const o=t&&t.error;if(o){const a=o.status;if(typeof a=="string"){if(!S[a])return new d("internal","internal");r=S[a],n=a}const i=o.message;typeof i=="string"&&(n=i),s=o.details,s!==void 0&&(s=y(s))}}catch{}return r==="ok"?null:new d(r,n,s)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class V{constructor(t,r,n,s){this.app=t,this.auth=null,this.messaging=null,this.appCheck=null,this.serverAppAppCheckToken=null,G(t)&&t.settings.appCheckToken&&(this.serverAppAppCheckToken=t.settings.appCheckToken),this.auth=r.getImmediate({optional:!0}),this.messaging=n.getImmediate({optional:!0}),this.auth||r.get().then(o=>this.auth=o,()=>{}),this.messaging||n.get().then(o=>this.messaging=o,()=>{}),this.appCheck||s==null||s.get().then(o=>this.appCheck=o,()=>{})}async getAuthToken(){if(this.auth)try{const t=await this.auth.getToken();return t==null?void 0:t.accessToken}catch{return}}async getMessagingToken(){if(!(!this.messaging||!("Notification"in self)||Notification.permission!=="granted"))try{return await this.messaging.getToken()}catch{return}}async getAppCheckToken(t){if(this.serverAppAppCheckToken)return this.serverAppAppCheckToken;if(this.appCheck){const r=t?await this.appCheck.getLimitedUseToken():await this.appCheck.getToken();return r.error?null:r.token}return null}async getContext(t){const r=await this.getAuthToken(),n=await this.getMessagingToken(),s=await this.getAppCheckToken(t);return{authToken:r,messagingToken:n,appCheckToken:s}}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const T="us-central1",X=/^data: (.*?)(?:\n|$)/;function K(e){let t=null;return{promise:new Promise((r,n)=>{t=setTimeout(()=>{n(new d("deadline-exceeded","deadline-exceeded"))},e)}),cancel:()=>{t&&clearTimeout(t)}}}class Y{constructor(t,r,n,s,o=T,a=(...i)=>fetch(...i)){this.app=t,this.fetchImpl=a,this.emulatorOrigin=null,this.contextProvider=new V(t,r,n,s),this.cancelAllRequests=new Promise(i=>{this.deleteService=()=>Promise.resolve(i())});try{const i=new URL(o);this.customDomain=i.origin+(i.pathname==="/"?"":i.pathname),this.region=T}catch{this.customDomain=null,this.region=o}}_delete(){return this.deleteService()}_url(t){const r=this.app.options.projectId;return this.emulatorOrigin!==null?`${this.emulatorOrigin}/${r}/${this.region}/${t}`:this.customDomain!==null?`${this.customDomain}/${t}`:`https://${this.region}-${r}.cloudfunctions.net/${t}`}}function z(e,t,r){const n=O(t);e.emulatorOrigin=`http${n?"s":""}://${t}:${r}`,n&&(U(e.emulatorOrigin+"/backends"),x("Functions",!0))}function W(e,t,r){const n=s=>Z(e,t,s,{});return n.stream=(s,o)=>te(e,t,s,o),n}function D(e){return e.emulatorOrigin&&O(e.emulatorOrigin)?"include":void 0}async function Q(e,t,r,n,s){r["Content-Type"]="application/json";let o;try{o=await n(e,{method:"POST",body:JSON.stringify(t),headers:r,credentials:D(s)})}catch{return{status:0,json:null}}let a=null;try{a=await o.json()}catch{}return{status:o.status,json:a}}async function _(e,t){const r={},n=await e.contextProvider.getContext(t.limitedUseAppCheckTokens);return n.authToken&&(r.Authorization="Bearer "+n.authToken),n.messagingToken&&(r["Firebase-Instance-ID-Token"]=n.messagingToken),n.appCheckToken!==null&&(r["X-Firebase-AppCheck"]=n.appCheckToken),r}function Z(e,t,r,n){const s=e._url(t);return ee(e,s,r,n)}async function ee(e,t,r,n){r=w(r);const s={data:r},o=await _(e,n),a=n.timeout||7e4,i=K(a),u=await Promise.race([Q(t,s,o,e.fetchImpl,e),i.promise,e.cancelAllRequests]);if(i.cancel(),!u)throw new d("cancelled","Firebase Functions instance was deleted.");const l=A(u.status,u.json);if(l)throw l;if(!u.json)throw new d("internal","Response is not valid JSON object.");let c=u.json.data;if(typeof c>"u"&&(c=u.json.result),typeof c>"u")throw new d("internal","Response is missing data field.");return{data:y(c)}}function te(e,t,r,n){const s=e._url(t);return ne(e,s,r,n||{})}async function ne(e,t,r,n){var h;r=w(r);const s={data:r},o=await _(e,n);o["Content-Type"]="application/json",o.Accept="text/event-stream";let a;try{a=await e.fetchImpl(t,{method:"POST",body:JSON.stringify(s),headers:o,signal:n==null?void 0:n.signal,credentials:D(e)})}catch(p){if(p instanceof Error&&p.name==="AbortError"){const k=new d("cancelled","Request was cancelled.");return{data:Promise.reject(k),stream:{[Symbol.asyncIterator](){return{next(){return Promise.reject(k)}}}}}}const g=A(0,null);return{data:Promise.reject(g),stream:{[Symbol.asyncIterator](){return{next(){return Promise.reject(g)}}}}}}let i,u;const l=new Promise((p,g)=>{i=p,u=g});(h=n==null?void 0:n.signal)==null||h.addEventListener("abort",()=>{const p=new d("cancelled","Request was cancelled.");u(p)});const c=a.body.getReader(),m=re(c,i,u,n==null?void 0:n.signal);return{stream:{[Symbol.asyncIterator](){const p=m.getReader();return{async next(){const{value:g,done:k}=await p.read();return{value:g,done:k}},async return(){return await p.cancel(),{done:!0,value:void 0}}}}},data:l}}function re(e,t,r,n){const s=(a,i)=>{const u=a.match(X);if(!u)return;const l=u[1];try{const c=JSON.parse(l);if("result"in c){t(y(c.result));return}if("message"in c){i.enqueue(y(c.message));return}if("error"in c){const m=A(0,c);i.error(m),r(m);return}}catch(c){if(c instanceof d){i.error(c),r(c);return}}},o=new TextDecoder;return new ReadableStream({start(a){let i="";return u();async function u(){if(n!=null&&n.aborted){const l=new d("cancelled","Request was cancelled");return a.error(l),r(l),Promise.resolve()}try{const{value:l,done:c}=await e.read();if(c){i.trim()&&s(i.trim(),a),a.close();return}if(n!=null&&n.aborted){const h=new d("cancelled","Request was cancelled");a.error(h),r(h),await e.cancel();return}i+=o.decode(l,{stream:!0});const m=i.split(`
`);i=m.pop()||"";for(const h of m)h.trim()&&s(h.trim(),a);return u()}catch(l){const c=l instanceof d?l:A(0,null);a.error(c),r(c)}}},cancel(){return e.cancel()}})}const C="@firebase/functions",v="0.13.1";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const se="auth-internal",ie="app-check-internal",oe="messaging-internal";function ae(e){const t=(r,{instanceIdentifier:n})=>{const s=r.getProvider("app").getImmediate(),o=r.getProvider(se),a=r.getProvider(oe),i=r.getProvider(ie);return new Y(s,o,a,i,n)};$(new M(N,t,"PUBLIC").setMultipleInstances(!0)),b(C,v,e),b(C,v,"esm2020")}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ce(e=I(),t=T){const n=R(E(e),N).getImmediate({identifier:t}),s=L("functions");return s&&ue(n,...s),n}function ue(e,t,r){z(E(e),t,r)}function le(e,t,r){return W(E(e),t)}ae();const de={apiKey:"AIzaSyCHh99l2qi5XQHeWV0fh8FSGHriiIraT7s",authDomain:"logistics-intel.firebaseapp.com",projectId:"logistics-intel",storageBucket:"logistics-intel.firebasestorage.app",messagingSenderId:"187580267283",appId:"1:187580267283:web:9c6bc974f7048a96b178e6",measurementId:"G-BG53DJBNDP"},fe=H().length?I():J(de),pe=ce(fe,"us-central1"),f=(e,t)=>async r=>{try{const s=await le(pe,e)(r??{});return s==null?void 0:s.data}catch{return typeof t=="function"?t(r):t}},ge=f("generateRfpPdf",{ok:!1}),ye=f("createStripePortalSession",{ok:!1}),ke=f("sendEmail",{ok:!1,message:"Email not yet wired"}),we=f("phantombusterLinkedIn",{ok:!1,message:"Disabled"}),Ae=f("searchLeads",{ok:!0,results:[],total:0}),Te=f("toggleCompanySave",{ok:!0,saved:!1}),Ee=f("debugAgent",{ok:!1}),Ne=f("litPing",{ok:!0,ts:Date.now(),uid:null}),be=f("getCompanyOverview",{totals:{shipments:0,spendUSD:0,lanes:0,carriers:0},trend:[],byMode:[]}),Se=f("getCompanyShipments",{rows:[],total:0}),me=f("ai_enrichCompany",{ok:!1}),Ce=me;export{me as aiEnrichCompany,ye as createStripePortalSession,Ee as debugAgent,Ce as enrichCompany,ge as generateRfpPdf,be as getCompanyOverview,Se as getCompanyShipments,Ne as litPing,we as phantombusterLinkedIn,Ae as searchLeads,ke as sendEmail,Te as toggleCompanySave};
