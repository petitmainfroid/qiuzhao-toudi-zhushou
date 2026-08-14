import type { JobRecord } from "../../job-contracts/src/index";
export interface JobWorkbenchCard { jobId:string; title:string; company:string; location:string; link:string; jd:string; state:string; requiresReview:boolean; }
export function toWorkbenchCards(records:readonly JobRecord[]):readonly JobWorkbenchCard[]{return Object.freeze(records.map(r=>Object.freeze({jobId:r.jobId,title:r.title,company:r.company,location:r.location,link:`${r.identity.origin}${r.identity.path}`,jd:r.description,state:r.state,requiresReview:r.state==="review_required"})));}
