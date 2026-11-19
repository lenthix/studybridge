import { z } from 'zod';
export const Field = z.object({id:z.string(),label:z.string(),options:z.array(z.string())});
export const Question = z.object({kind:z.enum(['single','multiple','true-false','blanks','matching','dropdown','ordering','numerical','short','programming']),text:z.string().min(1).max(40000),choices:z.array(z.string()).max(100),fields:z.array(Field).max(100),passage:z.string().max(40000),visualDescription:z.string().max(12000),imageRefs:z.array(z.string()),missingInformation:z.boolean()});
export const Extraction = z.object({questions:z.array(Question).max(100),warnings:z.array(z.string())});
export const Answer = z.object({answer:z.string().max(40000),choiceIndices:z.array(z.number().int()),selectedChoices:z.array(z.string()),fields:z.array(z.object({id:z.string(),label:z.string(),answer:z.string()})),explanation:z.string().max(40000),confidence:z.number().min(0).max(1),needsReview:z.boolean()});
export type QuestionData = z.infer<typeof Question>;
export type AnswerData = z.infer<typeof Answer>;
export const Settings = z.object({model:z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/).default('gpt-5.4-mini'),relayUrl:z.string().max(300).default(''),protect:z.boolean().default(false),history:z.boolean().default(false),onboarded:z.boolean().default(false),interval:z.number().int().min(5).max(300).default(15),concurrency:z.number().int().min(1).max(3).default(1),maxRequests:z.number().int().min(1).max(500).default(40),budget:z.number().min(0.05).max(100).default(2),inputPrice:z.number().min(.01).max(200).default(.75),outputPrice:z.number().min(.01).max(1000).default(4.5)});
export type Config = z.infer<typeof Settings>;
export const Material = z.object({label:z.string().max(200),text:z.string().max(80000),images:z.array(z.object({id:z.string().max(100),data:z.string().max(12_000_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)})).max(20)});
export type MaterialData = z.infer<typeof Material>;
export type Item = {id:string;number:number;status:'discovered'|'processing'|'answered'|'failed'|'cancelled';question:QuestionData;passageRef?:string;answer?:AnswerData;error?:string;material:MaterialData};
export type Batch = {id:string;label:string;status:string;error?:string};
export type Snapshot = {sessionId:string;revision:number;status:string;items:Item[];batches:Batch[];requests:number;reserved:number;estimated:number;capture:boolean;source:string;preview:string};
export type WireSnapshot = Snapshot & {assets:Record<string,string>};
export function toWireSnapshot(snapshot:Snapshot):WireSnapshot {
  const assets:Record<string,string>={},seen=new Map<string,string>();
  return {...snapshot,preview:'',items:snapshot.items.map(item=>({...item,material:{...item.material,images:item.material.images.map(im=>{let ref=seen.get(im.data);if(!ref){ref='asset:'+seen.size;seen.set(im.data,ref);assets[ref]=im.data;}return {...im,data:ref};})}})),assets};
}
export function fromWireSnapshot(snapshot:WireSnapshot):Snapshot {return {...snapshot,items:snapshot.items.map(item=>({...item,material:{...item.material,images:item.material.images.map(im=>({...im,data:snapshot.assets[im.data]||''}))}}))};}
export function validateAnswer(q:QuestionData, a:AnswerData, imageIds:string[]):AnswerData {
  const v=Answer.parse(a);
  if(q.missingInformation||(q.visualDescription&&!q.imageRefs.length)||q.imageRefs.some(id=>!imageIds.includes(id))||v.confidence<.75) v.needsReview=true;
  if(new Set(v.choiceIndices).size!==v.choiceIndices.length || v.choiceIndices.some(i=>i<1||i>q.choices.length)) throw Error('Answer choices do not match the extracted question.');
  if(v.selectedChoices.length!==v.choiceIndices.length||v.selectedChoices.some((s,i)=>s!==q.choices[v.choiceIndices[i]-1])) throw Error('Selected choice text does not match.');
  if(new Set(q.fields.map(f=>f.id)).size!==q.fields.length || new Set(v.fields.map(f=>f.id)).size!==v.fields.length) throw Error('Duplicate field labels.');
  for(const f of v.fields){const src=q.fields.find(x=>x.id===f.id);if(!src||src.label!==f.label|| (src.options.length&&!src.options.includes(f.answer))) throw Error('A blank or dropdown answer does not match its row.');}
  if(!v.needsReview){if(['single','true-false'].includes(q.kind)&&v.choiceIndices.length!==1) throw Error('Expected one selected choice.');if(q.kind==='multiple'&&!v.choiceIndices.length) throw Error('Expected selected choices.');if(q.fields.length!==v.fields.length) throw Error('Not all fields were answered.');}
  if(q.missingInformation||(q.visualDescription&&!q.imageRefs.length)||q.imageRefs.some(id=>!imageIds.includes(id))||v.confidence<.75) v.needsReview=true;
  return v;
}


