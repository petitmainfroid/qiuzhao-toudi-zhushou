import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { AtRestProtector } from "../../../gerenxinxi/profile-service/src/types";
import { parseJobEvent, parseJobRecord, type JobEvent, type JobRecord } from "../../job-contracts/src/index";

type Stored = { schemaVersion: 1; version: number; records: JobRecord[]; events: JobEvent[] };
export class JobRepositoryError extends Error { constructor(public readonly code: "conflict" | "not_found" | "corrupt_storage" | "protection_failed") { super(code); } }
export class FileJobRepository {
  constructor(private readonly options: { filePath: string; protector: AtRestProtector }) {}
  async list(): Promise<Readonly<{ version: number; records: readonly JobRecord[]; events: readonly JobEvent[] }>> { const s=await this.load(); return Object.freeze({ version:s.version, records:Object.freeze([...s.records]), events:Object.freeze([...s.events]) }); }
  async upsert(record: unknown, expectedVersion: number): Promise<Readonly<{ version:number; record:JobRecord; created:boolean }>> {
    const parsed=parseJobRecord(record) as JobRecord; const state=await this.load(); if(state.version!==expectedVersion) throw new JobRepositoryError("conflict");
    const key=this.key(parsed); const index=state.records.findIndex(x=>this.key(x)===key); const created=index<0; const next={...state,version:state.version+1,records:[...state.records]};
    if(created) next.records.push(parsed); else next.records[index]={...parsed,jobId:state.records[index].jobId,createdAt:state.records[index].createdAt,version:state.records[index].version+1};
    await this.save(next); return Object.freeze({version:next.version,record:next.records[created?next.records.length-1:index],created});
  }
  async appendEvent(event: unknown, expectedVersion:number): Promise<number> { const parsed=parseJobEvent(event) as JobEvent; const state=await this.load(); if(state.version!==expectedVersion) throw new JobRepositoryError("conflict"); if(!state.records.some(x=>x.jobId===parsed.jobId)) throw new JobRepositoryError("not_found"); const next={...state,version:state.version+1,events:[...state.events,parsed]}; await this.save(next); return next.version; }
  private key(record: JobRecord) { return createHash("sha256").update(`${record.identity.source}|${record.identity.origin}|${record.identity.path}|${record.identity.sourceJobRef}`).digest("hex"); }
  private async load(): Promise<Stored> { try { const encrypted=await readFile(this.options.filePath,"utf8"); const value=JSON.parse(await this.options.protector.unprotect(encrypted)) as unknown; if(!value||typeof value!=="object") throw new Error(); const v=value as Stored; if(v.schemaVersion!==1||!Number.isSafeInteger(v.version)||!Array.isArray(v.records)||!Array.isArray(v.events)) throw new Error(); return {schemaVersion:1,version:v.version,records:v.records.map(x=>parseJobRecord(x) as JobRecord),events:v.events.map(x=>parseJobEvent(x) as JobEvent)}; } catch(error) { if((error as NodeJS.ErrnoException).code==="ENOENT") return {schemaVersion:1,version:0,records:[],events:[]}; throw new JobRepositoryError("corrupt_storage"); } }
  private async save(state: Stored): Promise<void> { let payload:string; try { payload=await this.options.protector.protect(JSON.stringify(state)); if(!payload) throw new Error(); } catch { throw new JobRepositoryError("protection_failed"); } await mkdir(dirname(this.options.filePath),{recursive:true}); const temp=`${this.options.filePath}.${randomUUID()}.tmp`; await writeFile(temp,payload,{encoding:"utf8",flag:"wx"}); await rename(temp,this.options.filePath); }
}
