import { describe, expect, it } from "vitest";
import { Course, type CourseV2 } from "@mozes/content-schema";
import { start, step, canContinue, reconcile } from "./engine";
const make = (body: unknown[]) => Course.parse({ schema: "mozes-course", schemaVersion: 2, id: "c", title: "בדיקת תוכנה", locale: "he", units: [{ id: "u", title: "u", screens: [{ id: "s", title: "s", template: "text", required: true, slots: { body } }] }] }) as CourseV2;
describe("v2 server-replayable progress", () => {
  it("prevents skipping sequential reveals and preserves resume", () => { const course = make([{ id: "reveal", type: "reveal", mode: "sequential", requireAll: true, items: ["one", "two"].map(id => ({ id, title: id, content: { kind: "text", body: [] } })) }]); let state = start(course); expect(canContinue(course, state)).toBe(false); expect(() => step(course, state, { type: "reveal_item", componentId: "reveal", itemId: "two" })).toThrow(); state = step(course, state, { type: "reveal_item", componentId: "reveal", itemId: "one" }); state = reconcile(course, JSON.parse(JSON.stringify(state))); expect(canContinue(course, state)).toBe(false); state = step(course, state, { type: "reveal_item", componentId: "reveal", itemId: "two" }); expect(canContinue(course, state)).toBe(true); });
  it("computes simulation correctness and completion in the engine", () => { const course = make([{ id: "sim", type: "simulation", module: "software-sequence", moduleVersion: 1, config: { steps: ["one", "two", "three"] }, completion: { required: true } }]); let state = start(course); expect(() => step(course, state, { type: "simulation_step", componentId: "sim", action: 2 })).toThrow(); state = step(course, state, { type: "simulation_start", componentId: "sim" }); state = step(course, state, { type: "simulation_step", componentId: "sim", action: 2 }); expect(state.simulations?.sim?.nextStep).toBe(0); for (const action of [0, 1, 2]) state = step(course, state, { type: "simulation_step", componentId: "sim", action }); expect(canContinue(course, state)).toBe(true); expect(state.simulations?.sim?.events.at(-1)).toEqual({ type: "completed", score: 90, mistakes: 1 }); });
  it("persists narration preference across screens and resume", () => { const course = make([{ id: "text", type: "richText", body: [] }]); let state = step(course, start(course), { type: "narration_mute", muted: true }); state = reconcile(course, state); expect(state.preferences?.narrationMuted).toBe(true); });
  it("does not accept new events against v1 content", () => { const v2 = make([{ id: "text", type: "richText", body: [] }]); const v1 = Course.parse({ ...v2, schemaVersion: 1 }); expect(() => step(v1, start(v1), { type: "narration_mute", muted: true })).toThrow(); expect(start(v1)).not.toHaveProperty("contentSchemaVersion"); });
  it("retains only a valid prefix of sequential reveal progress after editing",()=>{
    const c=make([{id:"reveal",type:"reveal",mode:"sequential",items:["one","two","three"].map(id=>({id,title:id,content:{kind:"text",body:[]}}))}]);
    const state={...start(c),opened:{reveal:["three","two","two"]}};expect(reconcile(c,state).opened?.reveal).toEqual([]);
  });
  it("retries a decision per visit, persists variables, and goes back along real history",()=>{
    const c=Course.parse({schema:"mozes-course",schemaVersion:2,id:"branch",title:"בדיקת תוכנה",locale:"he",settings:{variables:{accepted:false}},units:[{id:"u",title:"בדיקה",screens:[
      {id:"decision",title:"צומת",template:"decision",slots:{media:[{id:"image",type:"image",media:{placeholder:{requestId:"r",description:"בדיקה"}},alt:"בדיקה"}],intro:[{id:"intro",type:"richText",body:[]}],decision:[{id:"q",type:"choiceQuestion",prompt:"בדיקה",mode:"single",maxAttempts:1,options:[{id:"good",text:"א",correct:true,setVariables:{accepted:true},feedback:"א"},{id:"retry",text:"ב",correct:false,setVariables:{accepted:false},feedback:"ב"}]}]},flow:{default:{kind:"end"},rules:[{id:"rule-good",when:{componentId:"q",outcome:{choice:"good"}},then:{kind:"goto",screenId:"end"}},{id:"rule-retry",when:{componentId:"q",outcome:{choice:"retry"}},then:{kind:"goto",screenId:"outcome"}}]}},
      {id:"outcome",title:"תוצאת בדיקה",template:"text",slots:{body:[]},flow:{default:{kind:"goto",screenId:"decision"}}},
      {id:"end",title:"סיום",template:"summary",slots:{body:[]},flow:{default:{kind:"end"}}},
    ]}]} );
    let state=step(c,start(c),{type:"answer",componentId:"q",response:{type:"choiceQuestion",optionIds:["retry"]}});
    state=step(c,state,{type:"continue"});expect(state.currentScreenId).toBe("outcome");
    state=step(c,state,{type:"continue"});expect(state.questions.q).toBeUndefined();
    state=step(c,state,{type:"answer",componentId:"q",response:{type:"choiceQuestion",optionIds:["good"]}});
    state=reconcile(c,JSON.parse(JSON.stringify(state)));expect(state.variables?.accepted).toBe(true);
    state=step(c,state,{type:"continue"});expect(state.currentScreenId).toBe("end");
    state=step(c,state,{type:"back"});expect(state.currentScreenId).toBe("decision");expect(state.decisions).toHaveLength(2);
  });
});
