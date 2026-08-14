export type WorkflowState = "idle" | "running" | "needs_replan" | "completed" | "cancelled" | "blocked";
export interface WorkflowSnapshot { jobId:string; state:WorkflowState; epoch:number; actionAttempts:number; maxActionAttempts:number; requestId:string | null; terminalReason:string | null; }
export class JobWorkflowError extends Error { constructor(public readonly code:"locked"|"cancelled"|"budget_exhausted"|"stale_epoch") {super(code)} }
export class DurableJobWorkflow {
  private readonly jobs=new Map<string,WorkflowSnapshot>();
  start(jobId:string,requestId:string,maxActionAttempts=2):Readonly<WorkflowSnapshot>{const current=this.jobs.get(jobId);if(current?.state==="running")throw new JobWorkflowError("locked");const next:WorkflowSnapshot={jobId,state:"running",epoch:(current?.epoch??0)+1,actionAttempts:0,maxActionAttempts,requestId,terminalReason:null};this.jobs.set(jobId,next);return Object.freeze({...next})}
  consume(jobId:string,epoch:number):Readonly<WorkflowSnapshot>{const w=this.current(jobId,epoch);if(w.state==="cancelled")throw new JobWorkflowError("cancelled");if(w.actionAttempts>=w.maxActionAttempts)throw new JobWorkflowError("budget_exhausted");w.actionAttempts++;return Object.freeze({...w})}
  restart():void{for(const w of this.jobs.values())if(w.state==="running"){w.state="needs_replan";w.epoch++;w.requestId=null}}
  cancel(jobId:string):Readonly<WorkflowSnapshot>{const w=this.jobs.get(jobId);if(!w)throw new JobWorkflowError("stale_epoch");w.state="cancelled";w.epoch++;w.requestId=null;w.terminalReason="cancelled";return Object.freeze({...w})}
  complete(jobId:string,epoch:number):Readonly<WorkflowSnapshot>{const w=this.current(jobId,epoch);w.state="completed";return Object.freeze({...w})}
  snapshot(jobId:string){const w=this.jobs.get(jobId);return w?Object.freeze({...w}):null}
  private current(jobId:string,epoch:number){const w=this.jobs.get(jobId);if(!w||w.epoch!==epoch)throw new JobWorkflowError("stale_epoch");return w}
}
