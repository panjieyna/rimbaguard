import { beforeEach,describe,expect,it,vi } from 'vitest'
import type { AssistantDraftRow, EvidenceUploadRow } from '../../shared/types/database'
import type { SessionUser } from '../../shared/types/domain'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),query:vi.fn(),eq:vi.fn(),download:vi.fn(),sign:vi.fn(),provider:vi.fn(),environment:vi.fn()}))
vi.mock('../../server/utils/config',()=>({getServerEnvironment:mocks.environment}))
vi.mock('../../server/services/ai/report-assistant',()=>({assistReport:mocks.provider,ASSISTANT_PROMPT_VERSION:'assistant-test'}))
vi.mock('../../server/services/report-service',()=>({toReportSummary:(row:unknown)=>row}))
vi.mock('../../server/utils/supabase',()=>{
  const from=()=>{const builder={select:()=>builder,eq:(...args:unknown[])=>{mocks.eq(...args);return builder},in:()=>builder,gt:()=>builder,order:()=>builder,limit:()=>builder,maybeSingle:()=>mocks.query()};return builder}
  return {getUserDatabase:()=>({from}),getServiceDatabase:()=>({from,rpc:mocks.rpc,storage:{from:()=>({download:mocks.download,createSignedUrl:mocks.sign})}})}
})
import { answerAssistant,getAssistantDraft,startAssistant } from '../../server/services/report-assistant-service'
import { ThreatAnalysisError } from '../../server/services/ai/threat-analysis'
import type { H3Event } from 'h3'

const user:SessionUser={id:'91000000-0000-4000-8000-000000000001',email:'unit@example.invalid',fullName:'Unit',role:'public'}
const result={visual_observations:['Fixture pengujian.'],reported_summary:'Keterangan fixture pengujian.',suggested_title:'[SIMULASI] Unit asisten',suggested_category:'uncertain',questions:[],limitations:'Tidak ada bukti lapangan.',needs_human_review:true}
const draft:AssistantDraftRow={id:'92000000-0000-4000-8000-000000000001',user_id:user.id,upload_id:'93000000-0000-4000-8000-000000000001',story:'Keterangan fixture terisolasi untuk uji asisten.',status:'processing',version:1,lease_token:'94000000-0000-4000-8000-000000000001',lease_expires_at:'2035-01-01T00:00:00Z',result:null,answers:[],model_name:'gemini-test',prompt_version:'assistant-test',error_code:null,expires_at:'2035-01-01T00:00:00Z',report_id:null,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'}
const receipt:Partial<EvidenceUploadRow>={id:draft.upload_id,user_id:user.id,sealed_path:`${user.id}/sealed/${draft.upload_id}.jpg`,status:'finalized'}
const ready={...draft,status:'ready' as const,result,lease_token:null,lease_expires_at:null}
const request={id:draft.id,uploadId:draft.upload_id,story:draft.story}
beforeEach(()=>{
  vi.resetAllMocks()
  mocks.environment.mockReturnValue({geminiApiKey:'unit-secret-not-real',geminiModel:'gemini-test'})
  mocks.query.mockResolvedValue({data:receipt,error:null})
  mocks.sign.mockResolvedValue({data:{signedUrl:'https://example.invalid/private-preview'},error:null})
  mocks.download.mockResolvedValue({data:new Blob([new Uint8Array([255,216,255,217])]),error:null})
  mocks.provider.mockResolvedValue({output:result,modelName:'gemini-test',promptVersion:'assistant-test'})
  mocks.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>name==='claim_report_assistant'?{data:{draft,claimed:true},error:null}:{data:args.p_error_code?{...draft,status:'failed',error_code:args.p_error_code}:ready,error:null})
})
describe('assistant persistence and orchestration',()=>{
  it('persists genuine provider output and exposes no internal lease or key',async()=>{
    const response=await startAssistant(user,request)
    expect(response.draft.status).toBe('ready')
    expect(mocks.provider).toHaveBeenCalledWith(expect.any(Uint8Array),draft.story,{apiKey:'unit-secret-not-real',model:'gemini-test'})
    expect(mocks.rpc).toHaveBeenCalledWith('finish_report_assistant',expect.objectContaining({p_id:draft.id,p_actor_id:user.id,p_lease_token:draft.lease_token,p_result:result}))
    expect(JSON.stringify(response)).not.toContain('unit-secret-not-real')
    expect(JSON.stringify(response)).not.toContain(draft.lease_token!)
  })
  it('does not charge a second AI request for an existing ready result',async()=>{
    mocks.rpc.mockResolvedValue({data:{draft:ready,claimed:false},error:null})
    expect((await startAssistant(user,request)).reused).toBe(true)
    expect(mocks.provider).not.toHaveBeenCalled();expect(mocks.download).not.toHaveBeenCalled()
  })
  it('does not charge a second AI request for a processing attempt',async()=>{
    mocks.rpc.mockResolvedValue({data:{draft,claimed:false},error:null})
    expect((await startAssistant(user,request)).draft.status).toBe('processing')
    expect(mocks.provider).not.toHaveBeenCalled()
  })
  it('persists a safe provider failure without synthesizing an analysis',async()=>{
    mocks.provider.mockRejectedValue(new ThreatAnalysisError('AI_QUOTA_EXCEEDED'))
    const response=await startAssistant(user,request)
    expect(response.draft.errorCode).toBe('AI_QUOTA_EXCEEDED')
    expect(response.draft.result).toBeNull()
    expect(mocks.rpc).toHaveBeenCalledWith('finish_report_assistant',expect.objectContaining({p_error_code:'AI_QUOTA_EXCEEDED'}))
  })
  it('rejects an untrusted stored evidence path before downloading it',async()=>{
    mocks.query.mockResolvedValue({data:{...receipt,sealed_path:'https://example.invalid/foreign'},error:null})
    await expect(startAssistant(user,request)).rejects.toMatchObject({statusCode:503})
    expect(mocks.download).not.toHaveBeenCalled();expect(mocks.provider).not.toHaveBeenCalled()
  })
  it('maps an absent hosted migration to a clear manual-reporting option',async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'Internal schema message'}})
    await expect(startAssistant(user,request)).rejects.toMatchObject({statusCode:503,statusMessage:'ASSISTANT_SCHEMA_UNAVAILABLE'})
    expect(mocks.provider).not.toHaveBeenCalled()
  })
  it('scopes every draft read to the current owner, including officers',async()=>{
    mocks.query.mockResolvedValueOnce({data:ready,error:null}).mockResolvedValueOnce({data:receipt,error:null})
    await getAssistantDraft({} as H3Event,{...user,role:'admin'},draft.id)
    expect(mocks.eq).toHaveBeenCalledWith('user_id',user.id)
  })
  it('does not return a missing or foreign draft',async()=>{
    mocks.query.mockResolvedValue({data:null,error:null})
    await expect(getAssistantDraft({} as H3Event,user,draft.id)).rejects.toMatchObject({statusCode:404})
  })
  it('passes the exact owner and version to the atomic answer operation',async()=>{
    mocks.rpc.mockResolvedValue({data:ready,error:null})
    await answerAssistant(user,draft.id,{expectedVersion:1,answers:[]})
    expect(mocks.rpc).toHaveBeenCalledWith('answer_report_assistant',{p_id:draft.id,p_actor_id:user.id,p_expected_version:1,p_answers:[]})
  })
})
