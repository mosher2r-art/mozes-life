import { describe, expect, it } from "vitest";
import { parseVtt } from "./vtt";
describe("safe WebVTT cues",()=>{
  it("reads Hebrew, multiline cues and markup as plain text",()=>{expect(parseVtt("WEBVTT\n\n00:00.000 --> 00:02.500\n<b>שלום</b> &amp;\nעולם\n")).toEqual([{start:0,end:2.5,text:"שלום &\nעולם"}]);});
  it("rejects malformed timestamps, reversed intervals and out-of-order cues",()=>{for(const text of ["00:99.000 --> 01:40.000\nno","00:02.000 --> 00:01.000\nno","00:02.000 --> 00:03.000\nlate\n\n00:00.000 --> 00:01.000\nearly"])expect(()=>parseVtt(`WEBVTT\n\n${text}`)).toThrow();});
  it("does not treat arbitrary text or a header alone as usable captions",()=>{expect(()=>parseVtt("hello")).toThrow();expect(()=>parseVtt("WEBVTT\n\nNOTE no cues")).toThrow();});
});
